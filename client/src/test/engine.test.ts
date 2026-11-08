// @vitest-environment jsdom
/* Attention engine pipeline with controlled mocks.
   MOCKED: the camera (getUserMedia), MediaPipe FaceLandmarker (returns synthetic landmarks or no face)
   and the ONNX session (returns a chosen score). REAL: sampling at 10 fps, the 100-frame window,
   inference cadence, tensor shape, no-face handling, pause/resume and camera release. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const detect = vi.fn();
const run = vi.fn();
const tensors: { type: string; data: Float32Array; dims: number[] }[] = [];
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
  FaceLandmarker: { createFromOptions: vi.fn(async () => ({ detectForVideo: detect })) },
}));
vi.mock("onnxruntime-web/wasm", () => ({
  env: { wasm: {} },
  Tensor: class {
    constructor(public type: string, public data: Float32Array, public dims: number[]) {
      tensors.push(this);
    }
  },
  InferenceSession: {
    create: vi.fn(async () => ({ inputNames: ["input_x"], outputNames: ["regression_scores", "classification_logits", "attention_weights"], run })),
  },
}));

import { FocusEngine, POINTS, toFaceCrop, WINDOW } from "../focus/engine";

const face = Array.from({ length: POINTS }, (_, i) => ({ x: i / POINTS, y: 0.5, z: 0.01 }));
const trackStop = vi.fn();
const stream = { getTracks: () => [{ stop: trackStop }], getVideoTracks: () => [] } as unknown as MediaStream;
let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  detect.mockReset().mockReturnValue({ faceLandmarks: [face] });
  run.mockReset().mockResolvedValue({
    regression_scores: { data: new Float32Array([0.73]) },
    attention_weights: { data: new Float32Array(100).fill(0.01) },
    classification_logits: { data: new Float32Array([0, 0, 0, 1, 0]) },
  });
  tensors.length = 0;
  trackStop.mockReset();
  getUserMedia = vi.fn(async () => stream);
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia, enumerateDevices: vi.fn(async () => []) }, configurable: true });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  Object.defineProperty(HTMLMediaElement.prototype, "readyState", { get: () => 4, configurable: true });
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  delete window.__bloomScoreOverride;
});

function makeEngine() {
  const onStatus = vi.fn();
  const onPrediction = vi.fn();
  const onProgress = vi.fn();
  const e = new FocusEngine({ onStatus, onPrediction, onProgress });
  return { e, onStatus, onPrediction, onProgress };
}

describe("FocusEngine", () => {
  it("no score before the 100-frame window is full; then [1,100,478,3] goes to the model", async () => {
    const { e, onStatus, onPrediction } = makeEngine();
    await e.start();
    expect(getUserMedia).toHaveBeenCalledWith({ video: { width: 640, height: 480 }, audio: false });
    expect(onStatus).toHaveBeenCalledWith("warming", undefined);
    await vi.advanceTimersByTimeAsync(9_000); // ~90 frames
    expect(onPrediction).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(onStatus).toHaveBeenCalledWith("tracking", undefined);
    expect(onPrediction).toHaveBeenCalledTimes(1);
    expect(tensors[0].dims).toEqual([1, WINDOW, POINTS, 3]);
    expect(tensors[0].data[3]).toBeCloseTo(face[1].x); // raw landmarks, frame-major
    expect(Object.keys(run.mock.calls[0][0])).toEqual(["input_x"]);
    const p = onPrediction.mock.calls[0][0];
    expect(p.score).toBeCloseTo(0.73);
    expect(p.attention).toHaveLength(100);
    expect(p.classes).toHaveLength(5);
    e.stop();
  });

  it("then infers about every 3 seconds", async () => {
    const { e, onPrediction } = makeEngine();
    await e.start();
    await vi.advanceTimersByTimeAsync(10_500);
    const n = onPrediction.mock.calls.length;
    await vi.advanceTimersByTimeAsync(9_000);
    expect(onPrediction.mock.calls.length - n).toBe(3);
    e.stop();
  });

  it("scores are clamped to 0..1 and NaN is dropped", async () => {
    const { e, onPrediction } = makeEngine();
    run.mockResolvedValueOnce({ regression_scores: { data: new Float32Array([1.7]) } });
    await e.start();
    await vi.advanceTimersByTimeAsync(10_500);
    expect(onPrediction.mock.calls[0][0]).toEqual({ score: 1, attention: null, classes: null });
    run.mockResolvedValueOnce({ regression_scores: { data: new Float32Array([NaN]) } });
    await vi.advanceTimersByTimeAsync(3_100);
    expect(onPrediction).toHaveBeenCalledTimes(1);
    e.stop();
  });

  it("no face: status 'noface', the window is emptied, the model is not run", async () => {
    const { e, onStatus, onProgress } = makeEngine();
    await e.start();
    await vi.advanceTimersByTimeAsync(5_000);
    detect.mockReturnValue({ faceLandmarks: [] });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(onStatus).toHaveBeenCalledWith("noface", undefined);
    detect.mockReturnValue({ faceLandmarks: [face] });
    onProgress.mockClear();
    await vi.advanceTimersByTimeAsync(200);
    expect(onProgress.mock.calls[0][0]).toBeLessThanOrEqual(2); // started again from an empty window
    expect(run).not.toHaveBeenCalled();
    e.stop();
  });

  it("paused (setActive(false)): no sampling and no predictions; resumes from the same window", async () => {
    const { e, onPrediction } = makeEngine();
    await e.start();
    await vi.advanceTimersByTimeAsync(10_500);
    expect(onPrediction).toHaveBeenCalledTimes(1);
    e.setActive(false);
    detect.mockClear();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(detect).not.toHaveBeenCalled();
    expect(onPrediction).toHaveBeenCalledTimes(1);
    e.setActive(true);
    await vi.advanceTimersByTimeAsync(3_100);
    expect(onPrediction).toHaveBeenCalledTimes(2); // window kept: next score after ~3 s, not 10 s
    e.stop();
  });

  it("a prediction that finishes after a pause is dropped", async () => {
    const { e, onPrediction } = makeEngine();
    let finish!: (v: unknown) => void;
    run.mockReturnValueOnce(new Promise((r) => (finish = r)));
    await e.start();
    await vi.advanceTimersByTimeAsync(10_500);
    e.setActive(false);
    finish({ regression_scores: { data: new Float32Array([0.9]) } });
    await vi.advanceTimersByTimeAsync(10);
    expect(onPrediction).not.toHaveBeenCalled();
    e.stop();
  });

  it("camera denied: error status with a clear Hebrew message", async () => {
    getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const { e, onStatus } = makeEngine();
    await expect(e.start()).rejects.toThrow("denied");
    expect(onStatus).toHaveBeenCalledWith("error", "לא הצלחנו להפעיל את המצלמה. בדקו שנתתם הרשאה ושהמצלמה לא בשימוש.");
  });

  it("a chosen camera is requested exactly", async () => {
    const { e } = makeEngine();
    await e.start("cam-2");
    expect(getUserMedia.mock.calls[0][0].video.deviceId).toEqual({ exact: "cam-2" });
    e.stop();
  });

  it("stop releases the camera and stops sampling; stop during start releases it too", async () => {
    const { e, onStatus } = makeEngine();
    await e.start();
    e.stop();
    expect(trackStop).toHaveBeenCalled();
    expect(onStatus).toHaveBeenLastCalledWith("stopped", undefined);
    detect.mockClear();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(detect).not.toHaveBeenCalled();

    trackStop.mockClear();
    let grant!: (s: MediaStream) => void;
    getUserMedia.mockReturnValueOnce(new Promise((r) => (grant = r)));
    const second = makeEngine();
    const starting = second.e.start();
    second.e.stop(); // user ended the session while the permission prompt was open
    grant(stream);
    await starting;
    expect(trackStop).toHaveBeenCalled();
  });

  it("a transient detector error is skipped", async () => {
    const { e, onPrediction } = makeEngine();
    detect.mockImplementationOnce(() => {
      throw new Error("frame");
    });
    await e.start();
    await vi.advanceTimersByTimeAsync(10_700);
    expect(onPrediction).toHaveBeenCalledTimes(1);
    e.stop();
  });

  it("test hook: a pinned score replaces the model output", async () => {
    window.__bloomScoreOverride = 0.2;
    const { e, onPrediction } = makeEngine();
    await e.start();
    await vi.advanceTimersByTimeAsync(10_500);
    expect(onPrediction.mock.calls[0][0].score).toBe(0.2);
    e.stop();
  });
});

describe("toFaceCrop (default: raw landmarks)", () => {
  it("copies x,y,z of all 478 points in order", () => {
    const f = toFaceCrop(face, 640, 480);
    expect(f).toHaveLength(POINTS * 3);
    expect([f[0], f[1], f[2]]).toEqual([0, 0.5, Math.fround(0.01)]);
    expect(f[(POINTS - 1) * 3]).toBeCloseTo((POINTS - 1) / POINTS);
  });
});
