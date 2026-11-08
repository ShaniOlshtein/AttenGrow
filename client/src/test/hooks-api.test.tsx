// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, setUnauthorizedHandler, tokenStore } from "../api";
import { useCountdown, useThirsty } from "../focus/focusHooks";
import { THIRSTY_AFTER_MS } from "../focus/focusLogic";
import { useApi } from "../hooks/useApi";
import { useFlash } from "../hooks/useFlash";
import { KEYS, storage } from "../lib/storage";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
  sessionStorage.clear();
});

describe("api()", () => {
  /** the ApiError a call rejects with (fails the test if it resolves) */
  const failure = (p: Promise<unknown>) =>
    p.then(
      () => {
        throw new Error("expected the call to fail");
      },
      (e: ApiError) => e,
    );
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends the token and JSON body, returns the data", async () => {
    tokenStore.set("T");
    fetchMock.mockResolvedValue(json(201, { id: "1" }));
    expect(await api("/api/content", { method: "POST", body: { a: 1 } })).toEqual({ id: "1" });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/content");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer T", "Content-Type": "application/json" });
    expect(init.body).toBe('{"a":1}');
  });
  it("GET without token or body has no extra headers", async () => {
    fetchMock.mockResolvedValue(json(200, []));
    await api("/api/x");
    expect(fetchMock.mock.calls[0][1]).toEqual({ method: "GET", headers: {}, body: undefined });
  });
  it("204 -> undefined", async () => {
    fetchMock.mockResolvedValue(json(204, null));
    expect(await api("/api/auth/logout", { method: "POST" })).toBeUndefined();
  });
  it("errors carry status, Hebrew detail and the X-Error-Code", async () => {
    fetchMock.mockResolvedValue(json(409, { detail: "הסשן כבר הסתיים" }, { "X-Error-Code": "session_ended" }));
    const err = await failure(api("/api/sessions/1/readings"));
    expect(err).toBeInstanceOf(ApiError);
    expect([err.status, err.message, err.code]).toEqual([409, "הסשן כבר הסתיים", "session_ended"]);
  });
  it("non-JSON / detail-less errors get a generic message", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 502 }));
    const err = await failure(api("/api/x"));
    expect([err.status, err.message, err.code]).toEqual([502, "משהו השתבש, נסו שוב", null]);
  });
  it("network failure -> status 0 with a clear message", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await failure(api("/api/x"));
    expect([err.status, err.message]).toEqual([0, "אין חיבור לשרת. בדקו את החיבור ונסו שוב"]);
  });
  it("401 with a token logs out (clears token, calls handler)", async () => {
    const onUnauth = vi.fn();
    setUnauthorizedHandler(onUnauth);
    tokenStore.set("old");
    fetchMock.mockResolvedValue(json(401, { detail: "יש להתחבר מחדש" }));
    await api("/api/users/me").catch(() => {});
    expect(tokenStore.get()).toBeNull();
    expect(onUnauth).toHaveBeenCalledTimes(1);
  });
  it("401 from the login form itself (wrong password) does not trigger logout", async () => {
    const onUnauth = vi.fn();
    setUnauthorizedHandler(onUnauth);
    tokenStore.set("still-valid");
    fetchMock.mockResolvedValue(json(401, { detail: "אימייל או סיסמה שגויים" }));
    await api("/api/auth/login", { method: "POST", body: {} }).catch(() => {});
    expect(tokenStore.get()).toBe("still-valid");
    expect(onUnauth).not.toHaveBeenCalled();
  });
});

describe("storage", () => {
  it("round trip in both areas", () => {
    storage.set(KEYS.autoPause, "1");
    storage.set(KEYS.room, "ABC", "session");
    expect(storage.get(KEYS.autoPause)).toBe("1");
    expect(storage.get(KEYS.room, "session")).toBe("ABC");
    storage.remove(KEYS.room, "session");
    expect(storage.get(KEYS.room, "session")).toBeNull();
  });
  it("never throws when storage is blocked", () => {
    const boom = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(boom);
    expect(storage.get("x")).toBeNull();
    expect(() => storage.set("x", "1")).not.toThrow();
    expect(() => storage.remove("x")).not.toThrow();
  });
});

describe("useApi", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());
  const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;

  it("loading -> ok", async () => {
    fetchMock().mockResolvedValue(json(200, [1, 2]));
    const { result } = renderHook(() => useApi<number[]>("/api/x"));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.data).toEqual([1, 2]);
  });
  it("404 -> notfound, other errors -> error with message", async () => {
    fetchMock().mockResolvedValueOnce(json(404, { detail: "התוכן לא נמצא" }));
    const a = renderHook(() => useApi("/api/content/x"));
    await waitFor(() => expect(a.result.current.status).toBe("notfound"));
    expect(a.result.current.error).toBe("התוכן לא נמצא");
    fetchMock().mockResolvedValueOnce(json(500, { detail: "שגיאת שרת, נסו שוב" }));
    const b = renderHook(() => useApi("/api/y"));
    await waitFor(() => expect(b.result.current.status).toBe("error"));
    expect(b.result.current.error).toBe("שגיאת שרת, נסו שוב");
  });
  it("null path does not fetch", () => {
    renderHook(() => useApi(null));
    expect(fetchMock()).not.toHaveBeenCalled();
  });
  it("reload keeps the data on screen and updates it", async () => {
    fetchMock().mockResolvedValueOnce(json(200, ["a"])).mockResolvedValueOnce(json(200, ["a", "b"]));
    const { result } = renderHook(() => useApi<string[]>("/api/list"));
    await waitFor(() => expect(result.current.data).toEqual(["a"]));
    let p: Promise<unknown>;
    act(() => {
      p = result.current.reload();
    });
    expect(result.current.data).toEqual(["a"]); // no flash back to "loading"
    await act(async () => {
      await p;
    });
    expect(result.current.data).toEqual(["a", "b"]);
  });
  it("a response for an old path is ignored", async () => {
    let resolveOld!: (r: Response) => void;
    fetchMock()
      .mockReturnValueOnce(new Promise<Response>((r) => (resolveOld = r)))
      .mockResolvedValueOnce(json(200, "new"));
    const { result, rerender } = renderHook(({ p }) => useApi<string>(p), { initialProps: { p: "/api/old" } });
    rerender({ p: "/api/new" });
    await waitFor(() => expect(result.current.data).toBe("new"));
    await act(async () => resolveOld(json(200, "old")));
    expect(result.current.data).toBe("new");
  });
});

describe("useFlash", () => {
  it("shows a value for ms, restarts on a new flash, clears on unmount", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useFlash(1000, ""));
    act(() => result.current[1]("hi"));
    expect(result.current[0]).toBe("hi");
    act(() => vi.advanceTimersByTime(600));
    act(() => result.current[1]("again")); // restarts the timer
    act(() => vi.advanceTimersByTime(600));
    expect(result.current[0]).toBe("again");
    act(() => vi.advanceTimersByTime(400));
    expect(result.current[0]).toBe("");
    act(() => result.current[1]("x"));
    unmount();
    expect(vi.getTimerCount()).toBe(0); // no timer left behind
  });
});

describe("useThirsty", () => {
  it("thirsty after 15 s of low scores, revives on a good score", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useThirsty());
    let ev: string | null = null;
    act(() => {
      ev = result.current.observe(0.2, 0);
    });
    expect(ev).toBeNull();
    act(() => {
      ev = result.current.observe(0.2, THIRSTY_AFTER_MS);
    });
    expect(ev).toBe("thirsty");
    expect(result.current.thirsty).toBe(true);
    act(() => {
      ev = result.current.observe(0.8, THIRSTY_AFTER_MS + 3000);
    });
    expect(ev).toBe("revived");
    expect(result.current.thirsty).toBe(false);
    expect(result.current.reviving).toBe(true);
    act(() => vi.advanceTimersByTime(1800));
    expect(result.current.reviving).toBe(false);
  });
  it("pauseClock restarts the 15 s; reset clears thirsty", () => {
    const { result } = renderHook(() => useThirsty());
    act(() => void result.current.observe(0.2, 0));
    act(() => result.current.pauseClock());
    let ev: string | null = "x";
    act(() => {
      ev = result.current.observe(0.2, THIRSTY_AFTER_MS + 1); // clock restarted at this reading
    });
    expect(ev).toBeNull();
    act(() => void result.current.observe(0.2, 2 * THIRSTY_AFTER_MS + 1));
    expect(result.current.thirsty).toBe(true);
    act(() => result.current.reset());
    expect(result.current.thirsty).toBe(false);
  });
});

describe("useCountdown", () => {
  it("ticks once a second only while running, never below 0", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ on }) => useCountdown(on), { initialProps: { on: false } });
    act(() => result.current[1](3));
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current[0]).toBe(3); // not running
    rerender({ on: true });
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current[0]).toBe(1);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current[0]).toBe(0);
    rerender({ on: false });
    expect(vi.getTimerCount()).toBe(0);
  });
});
