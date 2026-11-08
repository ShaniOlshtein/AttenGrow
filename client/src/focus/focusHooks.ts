import { useCallback, useEffect, useRef, useState } from "react";
import { useFlash } from "../hooks/useFlash";
import { nextThirst, NOT_THIRSTY, Thirst } from "./focusLogic";

const REVIVE_MS = 1800;

/** Low-focus ("thirsty plant") state. `observe` is safe to call from engine callbacks (no stale state). */
export function useThirsty() {
  const state = useRef<Thirst>(NOT_THIRSTY);
  const [thirsty, setThirsty] = useState(false);
  const [reviving, flashReviving] = useFlash(REVIVE_MS, false);

  const observe = useCallback(
    (score: number, now = Date.now()) => {
      const { next, event } = nextThirst(state.current, score, now);
      state.current = next;
      if (event === "thirsty") setThirsty(true);
      if (event === "revived") {
        setThirsty(false);
        flashReviving(true);
      }
      return event;
    },
    [flashReviving],
  );
  /** time not measuring (paused video, no face) never counts towards "thirsty" */
  const pauseClock = useCallback(() => {
    state.current = { ...state.current, lowSince: null };
  }, []);
  const reset = useCallback(() => {
    state.current = NOT_THIRSTY;
    setThirsty(false);
  }, []);

  return { thirsty, reviving, observe, pauseClock, reset };
}

/** Seconds left of a countdown that ticks only while `running`. */
export function useCountdown(running: boolean) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [running]);
  return [left, setLeft] as const;
}
