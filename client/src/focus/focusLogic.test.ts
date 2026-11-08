import { describe, expect, it } from "vitest";
import { focusedText, nextThirst, NOT_THIRSTY, plantMood, THIRSTY_AFTER_MS } from "./focusLogic";

describe("plantMood", () => {
  const base = { phase: "running" as const, measuring: true, status: "tracking" as const, score: 0.8 };
  it("grows at or above the focus threshold", () => {
    expect(plantMood(base)).toBe("grow");
    expect(plantMood({ ...base, score: 0.5 })).toBe("grow");
  });
  it("stays still between low and focus threshold, droops below low", () => {
    expect(plantMood({ ...base, score: 0.45 })).toBe("still");
    expect(plantMood({ ...base, score: 0.4 })).toBe("still");
    expect(plantMood({ ...base, score: 0.39 })).toBe("droop");
  });
  it("sleeps without a face, never while paused or on a break", () => {
    expect(plantMood({ ...base, status: "noface" })).toBe("sleep");
    expect(plantMood({ ...base, status: "noface", measuring: false })).toBe("still");
    expect(plantMood({ ...base, phase: "break", score: 0.1 })).toBe("still");
  });
  it("is still before the first score", () => {
    expect(plantMood({ ...base, score: null })).toBe("still");
  });
});

describe("nextThirst", () => {
  it("becomes thirsty only after 15 s of low scores, once", () => {
    let t = NOT_THIRSTY;
    let r = nextThirst(t, 0.2, 0);
    expect(r.event).toBe(null);
    t = r.next;
    r = nextThirst(t, 0.2, THIRSTY_AFTER_MS - 1);
    expect(r.event).toBe(null);
    t = r.next;
    r = nextThirst(t, 0.2, THIRSTY_AFTER_MS);
    expect(r).toEqual({ next: { lowSince: 0, thirsty: true }, event: "thirsty" });
    expect(nextThirst(r.next, 0.1, THIRSTY_AFTER_MS + 3000).event).toBe(null); // no second alert
  });
  it("a good score resets the clock and revives a thirsty plant", () => {
    const low = nextThirst(NOT_THIRSTY, 0.2, 0).next;
    expect(nextThirst(low, 0.6, 1000)).toEqual({ next: NOT_THIRSTY, event: null });
    expect(nextThirst({ lowSince: 0, thirsty: true }, 0.6, 20_000)).toEqual({ next: NOT_THIRSTY, event: "revived" });
  });
  it("the clock restarts after a pause (lowSince cleared)", () => {
    const r = nextThirst({ lowSince: null, thirsty: false }, 0.2, 50_000);
    expect(r.next.lowSince).toBe(50_000);
  });
});

describe("focusedText", () => {
  it("seconds under a minute, whole minutes after", () => {
    expect(focusedText(12.4)).toBe("12 שנ׳");
    expect(focusedText(125)).toBe("2 דק׳");
  });
});
