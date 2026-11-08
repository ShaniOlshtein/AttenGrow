// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Plant, { FULL_BLOOM } from "../bloom/Plant";
import { AttentionStrip } from "../bloom/AttentionStrip";
import { AsyncView, FormMessage, NotFound, ScoreValue } from "../components/common";
import { BreakBox, CameraControls, PlantStage, SessionIntro } from "../focus/SessionParts";
import { ConsentDialog, ScoreChart, ScoreMeter } from "../focus/widgets";
import type { Growth } from "../types";

afterEach(cleanup);
const inRouter = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
const growth = (g: Partial<Growth> = {}): Growth => ({
  level: 0, level_exact: 0, progress: 0, next_level_in: null, stage: "seed", blooms: 0, focused_seconds: 0, ...g,
});

describe("ScoreMeter", () => {
  it("before the first score: dash, waiting text, empty bar", () => {
    render(<ScoreMeter score={null} />);
    expect(screen.getByTestId("score").textContent).toBe("—");
    expect(screen.getByText("ממתין לציון ראשון…")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
  });
  it("custom waiting text (paused video)", () => {
    render(<ScoreMeter score={null} waitingText="המדידה מושהית" />);
    expect(screen.getByText("המדידה מושהית")).toBeTruthy();
  });
  it.each([
    [0.3, "0.30", "לא מרוכז/ת", "var(--terra)"],
    [0.55, "0.55", "ריכוז נמוך", "var(--sun)"],
    [0.9, "0.90", "מרוכז/ת מאוד", "var(--leaf)"],
  ])("score %s -> number, label and colored bar", (s, text, label, color) => {
    const { container } = render(<ScoreMeter score={s} />);
    expect(screen.getByTestId("score").textContent).toBe(text);
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(String(Math.round(s * 100)));
    expect((container.querySelector(".bar-fill") as HTMLElement).style.background).toBe(color);
  });
});

describe("ScoreChart", () => {
  it("empty -> message", () => {
    render(<ScoreChart points={[]} />);
    expect(screen.getByText("אין עדיין קריאות להצגה.")).toBeTruthy();
  });
  it("one dot per reading, with labels as tooltips", () => {
    const { container } = render(<ScoreChart points={[0.2, 0.5, 0.9]} labels={["a", "b", "c"]} />);
    expect(container.querySelectorAll("circle")).toHaveLength(3);
    expect(container.querySelector("circle title")?.textContent).toBe("a 0.20");
    expect(screen.getByRole("img", { name: "גרף ציון ריכוז לאורך הזמן" })).toBeTruthy();
  });
  it("a single reading is drawn in the middle (no division by zero)", () => {
    const { container } = render(<ScoreChart points={[0.5]} />);
    expect(Number(container.querySelector("circle")!.getAttribute("cx"))).toBe(300);
  });
});

describe("ConsentDialog", () => {
  it("agree / decline buttons and Escape", () => {
    const onAgree = vi.fn();
    const onDecline = vi.fn();
    render(<ConsentDialog onAgree={onAgree} onDecline={onDecline} />);
    expect(screen.getByRole("dialog", { name: "הסכמה לשימוש במצלמה" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "אני מסכים" }));
    expect(onAgree).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "לא, תודה" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDecline).toHaveBeenCalledTimes(2);
  });
  it("focuses the agree button", () => {
    render(<ConsentDialog onAgree={() => {}} onDecline={() => {}} />);
    expect(document.activeElement?.textContent).toBe("אני מסכים");
  });
});

describe("Plant", () => {
  it("seed at level 0, flower at full bloom", () => {
    const { container, rerender } = render(<Plant level={0} />);
    expect(container.querySelector(".seed")).toBeTruthy();
    expect(container.querySelector(".flower")).toBeNull();
    rerender(<Plant level={FULL_BLOOM} />);
    expect(container.querySelector(".flower")).toBeTruthy();
    expect(container.querySelector(".seed")).toBeNull();
  });
  it("clamps levels outside 0..FULL_BLOOM", () => {
    const { container } = render(<Plant level={99} />);
    expect(container.querySelectorAll(".flower")).toHaveLength(1);
    render(<Plant level={-5} label="x" />);
  });
  it("bud between level 7 and full bloom", () => {
    const { container } = render(<Plant level={9} />);
    expect(container.querySelector(".bud")).toBeTruthy();
  });
  it("mood classes, sleep shows zzz, label", () => {
    const { container } = render(<Plant level={3} mood="sleep" label="הצמח שלך" reviving />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("class")).toBe("plant mood-sleep reviving");
    expect(container.querySelector(".zzz")).toBeTruthy();
    expect(screen.getByRole("img", { name: "הצמח שלך" })).toBeTruthy();
  });
  it("cactus has no leaves; sunflower has 12 petals, fern 6", () => {
    const cactus = render(<Plant level={6} species="cactus" />);
    expect(cactus.container.querySelectorAll(".leaf")).toHaveLength(0);
    const sun = render(<Plant level={FULL_BLOOM} species="sunflower" />);
    expect(sun.container.querySelectorAll(".flower ellipse")).toHaveLength(12);
    const fern = render(<Plant level={FULL_BLOOM} species="fern" />);
    expect(fern.container.querySelectorAll(".flower ellipse")).toHaveLength(6);
  });
  it("no pot in the garden", () => {
    const { container } = render(<Plant level={2} pot={false} />);
    expect(container.querySelector("svg")!.getAttribute("class")).toContain("natural");
  });
});

describe("AttentionStrip", () => {
  it("one cell per frame, opacity by weight", () => {
    const { container } = render(<AttentionStrip weights={[0, 0.5, 1]} />);
    const rects = container.querySelectorAll("rect");
    expect(rects).toHaveLength(3);
    expect(Number(rects[2].getAttribute("opacity"))).toBeCloseTo(1);
    expect(Number(rects[0].getAttribute("opacity"))).toBeCloseTo(0.08);
  });
});

describe("common components", () => {
  it("AsyncView shows the right state", () => {
    const child = vi.fn(() => <p>תוכן</p>);
    const { rerender } = inRouter(<AsyncView status="loading" error="">{child}</AsyncView>);
    expect(screen.getByText("טוען…")).toBeTruthy();
    rerender(<MemoryRouter><AsyncView status="notfound" error="">{child}</AsyncView></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "לא נמצא" })).toBeTruthy();
    rerender(<MemoryRouter><AsyncView status="error" error="אוי">{child}</AsyncView></MemoryRouter>);
    expect(screen.getByText("אוי")).toBeTruthy();
    expect(child).not.toHaveBeenCalled();
    rerender(<MemoryRouter><AsyncView status="ok" error="">{child}</AsyncView></MemoryRouter>);
    expect(screen.getByText("תוכן")).toBeTruthy();
  });
  it("NotFound links back to the library", () => {
    inRouter(<NotFound />);
    expect(screen.getByRole("link", { name: "חזרה לספרייה" }).getAttribute("href")).toBe("/library");
  });
  it("ScoreValue", () => {
    const { rerender } = render(<ScoreValue v={null} />);
    expect(screen.getByText("אין מדידות")).toBeTruthy();
    rerender(<ScoreValue v={0.333} />);
    expect(screen.getByText("0.33")).toBeTruthy();
  });
  it("FormMessage: role by kind, nothing when empty", () => {
    const { container, rerender } = render(<FormMessage kind="error" text="" />);
    expect(container.innerHTML).toBe("");
    rerender(<FormMessage kind="error" text="שגיאה" />);
    expect(screen.getByRole("alert").textContent).toBe("שגיאה");
    rerender(<FormMessage kind="ok" text="נשמר" />);
    expect(screen.getByRole("status").textContent).toBe("נשמר");
  });
});

describe("session parts", () => {
  it("PlantStage: caption and progress only while running", () => {
    const g = growth({ stage: "leaves", focused_seconds: 125, progress: 0.42 });
    const { rerender } = render(<PlantStage level={4} species="fern" mood="grow" reviving={false} growth={g} showProgress={false} grew={false} />);
    expect(screen.queryByTestId("plant-stage")).toBeNull();
    rerender(<PlantStage level={4} species="fern" mood="grow" reviving={false} growth={g} showProgress grew />);
    expect(screen.getByTestId("plant-stage").textContent).toBe("עלים · 2 דק׳ מרוכזות");
    expect(screen.getByTestId("bloom-progress").textContent).toContain("לפריחה: 42% 🌱+");
    expect(screen.getByRole("img", { name: "הצמח שלך: עלים" })).toBeTruthy();
  });
  it("PlantStage: progress is capped at 100% and unknown stages read as seed", () => {
    render(<PlantStage level={0} species="fern" mood="still" reviving={false} growth={growth({ stage: "?", progress: 3 })} showProgress grew={false} />);
    expect(screen.getByTestId("bloom-progress").textContent).toContain("לפריחה: 100%");
    expect(screen.getByTestId("plant-stage").textContent).toContain("זרע");
  });
  it("SessionIntro per phase", () => {
    const onStart = vi.fn();
    const { rerender } = inRouter(<SessionIntro phase="idle" summary={null} onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: "התחל סשן" }));
    expect(onStart).toHaveBeenCalled();
    rerender(<MemoryRouter><SessionIntro phase="declined" summary={null} onStart={onStart} /></MemoryRouter>);
    expect(screen.getByRole("status").textContent).toContain("בחרת לצפות בלי מדידה");
    const summary = { ...growth(), reading_count: 4, average_score: 0.625 };
    rerender(<MemoryRouter><SessionIntro phase="ended" summary={summary} onStart={onStart} /></MemoryRouter>);
    expect(screen.getByRole("status").textContent).toContain("4 מדידות · ממוצע 0.63");
    expect(screen.getByRole("button", { name: "התחל סשן חדש" })).toBeTruthy();
    rerender(<MemoryRouter><SessionIntro phase="ended" summary={{ ...summary, reading_count: 0, average_score: null }} onStart={onStart} /></MemoryRouter>);
    expect(screen.getByRole("status").textContent).toContain("לא נאספו מדידות בסשן הזה.");
  });
  it("BreakBox: countdown format and buttons", () => {
    const onResume = vi.fn();
    const onEnd = vi.fn();
    const { rerender } = render(<BreakBox secondsLeft={300} busy={false} onResume={onResume} onEnd={onEnd} />);
    expect(screen.getByTestId("break-countdown").textContent).toBe("5:00");
    fireEvent.click(screen.getByRole("button", { name: "חזרה ללמידה עכשיו" }));
    fireEvent.click(screen.getByRole("button", { name: "סיים סשן" }));
    expect(onResume).toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalled();
    rerender(<BreakBox secondsLeft={0} busy onResume={onResume} onEnd={onEnd} />);
    expect(screen.getByTestId("break-countdown").textContent).toBe("0:00");
    expect(screen.getByRole("button", { name: "חזרה ללמידה" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "סיים סשן" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("CameraControls: cameras, default option, auto-pause toggle", () => {
    const onCamera = vi.fn();
    const onAutoPause = vi.fn();
    const cams = [
      { deviceId: "a", label: "OBS Virtual Camera" },
      { deviceId: "b", label: "" },
    ] as MediaDeviceInfo[];
    const { rerender } = render(<CameraControls cameras={[]} cameraId="" onCamera={onCamera} autoPause={null} onAutoPause={onAutoPause} />);
    expect(screen.getByRole("option", { name: "מצלמת ברירת מחדל" })).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull(); // text / web content cannot be paused
    rerender(<CameraControls cameras={cams} cameraId="a" onCamera={onCamera} autoPause={false} onAutoPause={onAutoPause} />);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["OBS Virtual Camera", "מצלמה 2"]);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "b" } });
    expect(onCamera).toHaveBeenCalledWith("b");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onAutoPause).toHaveBeenCalledWith(true);
  });
});
