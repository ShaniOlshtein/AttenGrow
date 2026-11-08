// @vitest-environment jsdom
/* Integration: playback state machine (video) + FocusPanel + attention engine + plant + server API.
   MOCKED: the camera/model engine (FocusEngine) - the test emits statuses and predictions itself - and the
   HTTP layer (fetch), which answers like the real server. REAL: FocusPanel, playback reducer, plant, api.ts. */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useReducer } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineEvents } from "../focus/engine";
import FocusPanel, { FocusHooks } from "../focus/FocusPanel";
import { INITIAL_PLAYBACK, reducePlayback } from "../focus/playback";

// ---- controlled engine mock ----
type FakeEngine = {
  ev: EngineEvents;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  setActive: ReturnType<typeof vi.fn>;
  previewElement: HTMLVideoElement;
};
const engines: FakeEngine[] = [];
let startImpl: (e: FakeEngine) => Promise<void> = async () => {};
vi.mock("../focus/engine", () => ({
  FocusEngine: class {
    ev: EngineEvents;
    start = vi.fn((_id?: string) => startImpl(this as unknown as FakeEngine));
    stop = vi.fn();
    setActive = vi.fn();
    previewElement = document.createElement("video");
    constructor(ev: EngineEvents) {
      this.ev = ev;
      engines.push(this as unknown as FakeEngine);
    }
  },
  listCameras: vi.fn(async () => []),
  preloadModels: vi.fn(async () => []),
}));

// ---- fake server ----
type Call = { method: string; path: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
let readingReply: (body: Record<string, unknown>) => Response;
const growthBody = (focused: number, extra: Record<string, unknown> = {}) => ({
  level: focused > 0 ? 1 : 0, level_exact: focused / 10, progress: focused / 1440, next_level_in: 5, stage: focused > 0 ? "sprout" : "seed",
  blooms: 0, focused_seconds: focused, position: 0, score: 0, created_at: "2026-01-01T00:00:00Z", ...extra,
});
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

beforeEach(() => {
  engines.length = 0;
  calls = [];
  startImpl = async () => {};
  let focused = 0;
  readingReply = (b) => {
    if ((b.score as number) >= 0.5) focused += 3;
    return reply(201, growthBody(focused));
  };
  vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(init.body as string) : null;
    calls.push({ method: init.method ?? "GET", path, body });
    if (path === "/api/sessions") return reply(201, { id: "S1", content_id: "C1", started_at: "2026-01-01T00:00:00Z" });
    if (path.endsWith("/readings")) return readingReply(body);
    if (path.endsWith("/end")) return reply(200, { ...growthBody(6), reading_count: 2, average_score: 0.85 });
    if (path.endsWith("/pause") || path.endsWith("/resume")) return reply(200, { id: "S1", playing: path.endsWith("resume") });
    return reply(404, { detail: "לא נמצא" });
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

const paths = (suffix: string) => calls.filter((c) => c.path.endsWith(suffix));
const engine = () => engines[engines.length - 1];
const emit = (score: number) => act(() => engine().ev.onPrediction({ score, attention: Array(100).fill(0.01), classes: null }));
const status = (s: Parameters<EngineEvents["onStatus"]>[0], info?: string) => act(() => engine().ev.onStatus(s, info));

let dispatch: (e: Parameters<typeof reducePlayback>[1]) => void;
function VideoHarness({ hooks, playingAtStart = false }: { hooks?: Partial<FocusHooks>; playingAtStart?: boolean }) {
  const [playback, d] = useReducer(reducePlayback, INITIAL_PLAYBACK);
  dispatch = d;
  return (
    <MemoryRouter>
      <FocusPanel contentId="C1" species="sunflower" playback={playback} onPlayback={d}
        hooks={{ getPosition: () => 42.25, pause: vi.fn(), isPlaying: () => playingAtStart, ...hooks }} />
    </MemoryRouter>
  );
}
const TextHarness = ({ hooks }: { hooks?: Partial<FocusHooks> }) => (
  <MemoryRouter>
    <FocusPanel contentId="C1" species="fern" hooks={{ getPosition: () => 120, ...hooks }} />
  </MemoryRouter>
);

async function startSession() {
  fireEvent.click(screen.getByRole("button", { name: "התחל סשן" }));
  fireEvent.click(screen.getByRole("button", { name: "אני מסכים" }));
  await waitFor(() => expect(engines.length).toBe(1));
  await waitFor(() => expect(engine().start).toHaveBeenCalled());
}

describe("text content: attention -> readings -> plant -> statistics", () => {
  it("a full session: score shown, reading saved with position, plant grows, summary after end", async () => {
    render(<TextHarness />);
    await startSession();
    expect(paths("/api/sessions")[0].body).toEqual({ content_id: "C1", room_code: null, playing: true });
    status("tracking");
    emit(0.8123);
    expect(screen.getByTestId("score").textContent).toBe("0.81");
    await waitFor(() => expect(paths("/readings")).toHaveLength(1));
    expect(paths("/readings")[0].body).toMatchObject({ position: 120, score: 0.8123 });
    expect((paths("/readings")[0].body!.attention as number[]).length).toBe(100);
    await waitFor(() => expect(screen.getByTestId("plant-stage").textContent).toBe("נבט · 3 שנ׳ מרוכזות"));
    emit(0.2); // low score: saved, but no growth
    await waitFor(() => expect(paths("/readings")).toHaveLength(2));
    expect(screen.getByTestId("plant-stage").textContent).toBe("נבט · 3 שנ׳ מרוכזות");
    expect(screen.getByRole("alert").textContent).toContain("הריכוז ירד");
    fireEvent.click(screen.getByRole("button", { name: "סיים סשן" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("2 מדידות · ממוצע 0.85"));
    expect(engine().stop).toHaveBeenCalled();
    expect(paths("/end")).toHaveLength(1);
  });

  it("double clicks start one session and end it once", async () => {
    render(<TextHarness />);
    fireEvent.click(screen.getByRole("button", { name: "התחל סשן" }));
    const agree = screen.getByRole("button", { name: "אני מסכים" });
    fireEvent.click(agree);
    fireEvent.click(agree);
    await waitFor(() => expect(engines.length).toBe(1));
    expect(paths("/api/sessions")).toHaveLength(1);
    const end = screen.getByRole("button", { name: "סיים סשן" });
    fireEvent.click(end);
    fireEvent.click(end);
    await waitFor(() => expect(screen.getByRole("button", { name: "התחל סשן חדש" })).toBeTruthy());
    expect(paths("/end")).toHaveLength(1);
  });

  it("no face: message, sleeping plant, nothing sent", async () => {
    const { container } = render(<TextHarness />);
    await startSession();
    status("noface");
    expect(screen.getByText(/לא זוהו פנים — הצמח ישן/)).toBeTruthy();
    expect(container.querySelector("svg.plant")!.getAttribute("class")).toContain("mood-sleep");
    expect(paths("/readings")).toHaveLength(0);
  });

  it("thirsty after 15 s of low focus, revives on recovery", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    render(<TextHarness />);
    await startSession();
    for (let t = 0; t <= 15; t += 3) {
      now = 1_000_000 + t * 1000;
      emit(0.2);
    }
    expect(screen.getByTestId("thirsty").textContent).toBe("הצמח שלך צמא לריכוז 🌱");
    now += 3000;
    emit(0.9);
    expect(screen.queryByTestId("thirsty")).toBeNull();
    expect(screen.getByText("הצמח התעורר! 🌿")).toBeTruthy();
  });

  it("a full bloom starts the earned break: camera off, countdown, back to studying restarts the engine", async () => {
    readingReply = () => reply(201, growthBody(1440, { level: 12, level_exact: 12, stage: "flower", blooms: 1, progress: 1 }));
    render(<TextHarness />);
    await startSession();
    emit(0.95);
    await waitFor(() => expect(screen.getByTestId("break-countdown").textContent).toBe("5:00"));
    expect(engines[0].stop).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "חזרה ללמידה עכשיו" }));
    await waitFor(() => expect(engines.length).toBe(2));
    expect(screen.getByTestId("engine-status")).toBeTruthy();
  });

  it("server says the session already ended -> message; leaving the page ends the session", async () => {
    readingReply = () => reply(409, { detail: "הסשן כבר הסתיים" }, { "X-Error-Code": "session_ended" });
    const { unmount } = render(<TextHarness />);
    await startSession();
    emit(0.7);
    await waitFor(() => expect(screen.getByText("הסשן כבר הסתיים")).toBeTruthy());
    unmount();
    expect(engine().stop).toHaveBeenCalled();
    await waitFor(() => expect(paths("/end")).toHaveLength(1));
  });
});

describe("video content: measurement follows the real playback state", () => {
  it("starts waiting for the video: no readings until it plays, then pause/resume reach the server", async () => {
    render(<VideoHarness />);
    await startSession();
    status("tracking"); // what the real engine reports once the camera and models are ready
    expect(paths("/api/sessions")[0].body).toMatchObject({ playing: false });
    expect(screen.getByTestId("playback-status").getAttribute("data-state")).toBe("waiting_for_video");
    expect(engine().setActive).toHaveBeenLastCalledWith(false);
    emit(0.9); // a late prediction while not playing is ignored
    expect(paths("/readings")).toHaveLength(0);
    expect(screen.getByTestId("score").textContent).toBe("—");

    act(() => dispatch({ type: "PLAY" }));
    await waitFor(() => expect(paths("/resume")).toHaveLength(1));
    expect(engine().setActive).toHaveBeenLastCalledWith(true);
    expect(screen.queryByTestId("playback-status")).toBeNull();
    emit(0.9);
    await waitFor(() => expect(paths("/readings")).toHaveLength(1));
    expect(paths("/readings")[0].body).toMatchObject({ position: 42.3 });

    act(() => dispatch({ type: "PAUSE" }));
    await waitFor(() => expect(paths("/pause")).toHaveLength(1));
    expect(screen.getByTestId("playback-status").getAttribute("data-state")).toBe("paused");
    expect(screen.getByTestId("score").textContent).toBe("—");
    expect(screen.getByTestId("engine-status").textContent).toBe("⏸ המדידה מושהית");
  });

  it("buffering, tab switch and another video pause the measurement", async () => {
    render(<VideoHarness playingAtStart />);
    await startSession();
    expect(paths("/api/sessions")[0].body).toMatchObject({ playing: true });
    for (const [ev, state] of [
      [{ type: "BUFFERING" }, "buffering"],
      [{ type: "PLAY" }, null],
      [{ type: "TAB_HIDDEN" }, "playing"],
      [{ type: "TAB_VISIBLE" }, null],
      [{ type: "VIDEO_CHANGED", original: false, playing: true }, "switched"],
      [{ type: "VIDEO_CHANGED", original: true, playing: true }, null],
      [{ type: "ERROR" }, "error"],
    ] as const) {
      act(() => dispatch(ev));
      const banner = screen.queryByTestId("playback-status");
      expect(banner?.getAttribute("data-state") ?? null).toBe(state);
    }
    expect(screen.getByText(/הסרטון לא נטען או לא מתנגן/)).toBeTruthy();
  });

  it("a paused-race 409 is dropped silently", async () => {
    readingReply = () => reply(409, { detail: "הסרטון לא מתנגן — המדידה מושהית" }, { "X-Error-Code": "session_paused" });
    render(<VideoHarness playingAtStart />);
    await startSession();
    emit(0.9);
    await waitFor(() => expect(paths("/readings")).toHaveLength(1));
    expect(screen.queryByText(/המדידה מושהית —|הסרטון לא מתנגן —/)).toBeNull();
  });

  it("auto-pause pauses the video when the plant gets thirsty (only if enabled)", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const pause = vi.fn();
    render(<VideoHarness playingAtStart hooks={{ pause }} />);
    await startSession();
    fireEvent.click(screen.getByRole("checkbox", { name: "לעצור את הסרטון כשהריכוז נמוך" }));
    expect(localStorage.getItem("bloom_autopause")).toBe("1");
    for (let t = 0; t <= 15; t += 3) {
      now = t * 1000;
      emit(0.1);
    }
    expect(pause).toHaveBeenCalledTimes(1);
  });
});

describe("robustness", () => {
  it("camera permission denied: clear message, the session can still be ended", async () => {
    startImpl = async (e) => {
      e.ev.onStatus("error", "לא הצלחנו להפעיל את המצלמה. בדקו שנתתם הרשאה ושהמצלמה לא בשימוש.");
      throw new DOMException("denied", "NotAllowedError");
    };
    render(<TextHarness />);
    fireEvent.click(screen.getByRole("button", { name: "התחל סשן" }));
    fireEvent.click(screen.getByRole("button", { name: "אני מסכים" }));
    await waitFor(() => expect(screen.getByText(/לא הצלחנו להפעיל את המצלמה/)).toBeTruthy());
    expect(screen.getByTestId("engine-status").textContent).toBe("שגיאה");
    fireEvent.click(screen.getByRole("button", { name: "סיים סשן" }));
    await waitFor(() => expect(paths("/end")).toHaveLength(1));
  });

  it("server unreachable when starting: message, no engine", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    render(<TextHarness />);
    fireEvent.click(screen.getByRole("button", { name: "התחל סשן" }));
    fireEvent.click(screen.getByRole("button", { name: "אני מסכים" }));
    await waitFor(() => expect(screen.getByText("אין חיבור לשרת. בדקו את החיבור ונסו שוב")).toBeTruthy());
    expect(engines).toHaveLength(0);
  });

  it("declining consent never starts the camera", () => {
    render(<TextHarness />);
    fireEvent.click(screen.getByRole("button", { name: "התחל סשן" }));
    fireEvent.click(screen.getByRole("button", { name: "לא, תודה" }));
    expect(screen.getByText(/בחרת לצפות בלי מדידה/)).toBeTruthy();
    expect(engines).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });
});
