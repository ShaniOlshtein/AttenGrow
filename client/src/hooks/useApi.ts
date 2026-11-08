import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { errorMessage } from "../lib/text";

export type LoadStatus = "loading" | "ok" | "notfound" | "error";
type Result<T> = { status: LoadStatus; data: T | null; error: string };

/** GET `path` on mount and whenever it changes (null = don't fetch).
    `reload()` fetches again without going back to "loading" (keeps the current data on screen). */
export function useApi<T>(path: string | null) {
  const [result, setResult] = useState<Result<T>>({ status: "loading", data: null, error: "" });

  const load = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      if (!path) return;
      try {
        const data = await api<T>(path);
        if (isCurrent()) setResult({ status: "ok", data, error: "" });
      } catch (e) {
        if (!isCurrent()) return;
        const status = e instanceof ApiError && e.status === 404 ? "notfound" : "error";
        setResult((r) => ({ status, data: r.data, error: errorMessage(e) }));
      }
    },
    [path],
  );

  useEffect(() => {
    let current = true;
    setResult({ status: "loading", data: null, error: "" });
    load(() => current);
    return () => {
      current = false;
    };
  }, [load]);

  return { ...result, reload: load };
}
