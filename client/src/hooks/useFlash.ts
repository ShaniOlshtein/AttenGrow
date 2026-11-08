import { useCallback, useEffect, useRef, useState } from "react";

/** A value that is shown for `ms` and then cleared - e.g. "copied ✓" or a short animation.
    The timer is cancelled on unmount and restarted on every flash. */
export function useFlash<T>(ms: number, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const timer = useRef<number | null>(null);
  const initialRef = useRef(initial);

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const flash = useCallback(
    (v: T) => {
      clear();
      setValue(v);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setValue(initialRef.current);
      }, ms);
    },
    [ms],
  );

  useEffect(() => clear, []);
  return [value, flash] as const;
}
