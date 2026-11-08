/* Pure rules of the watch screen (no React, no I/O) - unit tested in focusLogic.test.ts. */
import type { Mood } from "../bloom/Plant";
import { FOCUS_THRESHOLD, LOW_SCORE } from "../lib/score";
import type { EngineStatus } from "./engine";

export const THIRSTY_AFTER_MS = 15_000; // score below LOW_SCORE this long -> "the plant is thirsty"
export const BREAK_SECONDS = 5 * 60; // earned break after every full bloom

export type SessionPhase = "idle" | "consent" | "declined" | "running" | "break" | "ended";

/** How the live plant looks right now. */
export function plantMood(p: { phase: SessionPhase; measuring: boolean; status: EngineStatus; score: number | null }): Mood {
  if (p.phase === "break" || !p.measuring) return "still";
  if (p.status === "noface") return "sleep"; // the plant sleeps, it never dies
  if (p.score === null) return "still";
  if (p.score >= FOCUS_THRESHOLD) return "grow";
  if (p.score >= LOW_SCORE) return "still";
  return "droop";
}

export type Thirst = { lowSince: number | null; thirsty: boolean };
export const NOT_THIRSTY: Thirst = { lowSince: null, thirsty: false };

/** Low-focus rule: thirsty after THIRSTY_AFTER_MS of low scores; any good score revives the plant. */
export function nextThirst(t: Thirst, score: number, now: number): { next: Thirst; event: "thirsty" | "revived" | null } {
  if (score < LOW_SCORE) {
    const lowSince = t.lowSince ?? now;
    const becomes = !t.thirsty && now - lowSince >= THIRSTY_AFTER_MS;
    return { next: { lowSince, thirsty: t.thirsty || becomes }, event: becomes ? "thirsty" : null };
  }
  return { next: NOT_THIRSTY, event: t.thirsty ? "revived" : null };
}

/** "12 שנ׳" under a minute, otherwise whole minutes */
export const focusedText = (seconds: number) => (seconds < 60 ? `${Math.round(seconds)} שנ׳` : `${Math.floor(seconds / 60)} דק׳`);
