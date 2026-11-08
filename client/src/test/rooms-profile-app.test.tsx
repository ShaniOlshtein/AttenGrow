// @vitest-environment jsdom
/* Study room panel (short polling), room join, profile, routing guards and the YouTube wrapper.
   The HTTP layer is a fetch mock; the YouTube IFrame API is a fake window.YT. */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { AuthProvider } from "../auth";
import RoomPanel, { Member } from "../bloom/RoomPanel";
import YouTubePlayer, { PlayerHandle } from "../focus/YouTubePlayer";
import Profile from "../pages/Profile";
import RoomJoin from "../pages/RoomJoin";

type Handler = (method: string, body: Record<string, unknown> | null) => Response;
let routes: Record<string, Handler> = {};
const calls: { method: string; path: string; body: unknown }[] = [];
const reply = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const me = { id: "u1", email: "a@b.co", display_name: "נועה", created_at: "2026-01-01T00:00:00Z" };

beforeEach(() => {
  routes = { "/api/users/me": () => reply(200, me) };
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(init.body as string) : null;
    calls.push({ method: init.method ?? "GET", path, body });
    const h = routes[path.split("?")[0]];
    return h ? h(init.method ?? "GET", body) : reply(404, { detail: "לא נמצא" });
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
  sessionStorage.clear();
  delete window.YT;
});

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname}</p>;
}

describe("App routing", () => {
  it("logged out: protected pages redirect to login and remember the page", async () => {
    render(<MemoryRouter initialEntries={["/history"]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "התחברות" })).toBeTruthy();
    expect(sessionStorage.getItem("bloom_from")).toBe("/history");
  });
  it("logged in: the shell shows the name; the landing page redirects to the library", async () => {
    localStorage.setItem("bloom_token", "T");
    routes["/api/content"] = () => reply(200, []);
    render(<MemoryRouter initialEntries={["/"]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "הספרייה שלי" })).toBeTruthy();
    expect(screen.getByTestId("display-name").textContent).toBe("שלום, נועה");
    expect(screen.getByRole("navigation", { name: "ניווט ראשי" }).textContent).toContain("יומן הגינה");
  });
  it("logout: denylists the token and returns to login", async () => {
    localStorage.setItem("bloom_token", "T");
    routes["/api/content"] = () => reply(200, []);
    routes["/api/auth/logout"] = () => reply(204, null);
    render(<MemoryRouter initialEntries={["/library"]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "התנתק" }));
    expect(await screen.findByRole("heading", { name: "התחברות" })).toBeTruthy();
    expect(localStorage.getItem("bloom_token")).toBeNull();
    expect(calls.some((c) => c.path === "/api/auth/logout")).toBe(true);
  });
  it("unknown page while logged in -> 'לא נמצא'", async () => {
    localStorage.setItem("bloom_token", "T");
    render(<MemoryRouter initialEntries={["/nope"]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "לא נמצא" })).toBeTruthy();
  });
  it("landing page for visitors", async () => {
    render(<MemoryRouter initialEntries={["/"]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
    expect(await screen.findByText("תתרכזו — ותראו מה צומח")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("Profile", () => {
  const renderProfile = async () => {
    localStorage.setItem("bloom_token", "T");
    render(
      <MemoryRouter initialEntries={["/profile"]}>
        <AuthProvider>
          <Routes>
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    await screen.findByText("a@b.co");
  };
  it("rename shows success; server errors are shown next to the right form", async () => {
    routes["/api/users/me"] = (m, b) => (m === "PATCH" ? reply(200, { ...me, display_name: b!.display_name }) : reply(200, me));
    await renderProfile();
    fireEvent.change(screen.getByLabelText("שם תצוגה"), { target: { value: "נועה כהן" } });
    fireEvent.click(screen.getByRole("button", { name: "שמירת שם" }));
    expect(await screen.findByText("שם התצוגה עודכן")).toBeTruthy();
    routes["/api/users/me/password"] = () => reply(400, { detail: "הסיסמה הנוכחית שגויה" });
    fireEvent.change(screen.getByLabelText("סיסמה נוכחית"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText(/סיסמה חדשה/), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "שינוי סיסמה" }));
    expect(screen.getByRole("alert").textContent).toBe("הסיסמה החדשה חייבת להכיל לפחות 8 תווים");
    fireEvent.change(screen.getByLabelText(/סיסמה חדשה/), { target: { value: "NewPassword1" } });
    fireEvent.click(screen.getByRole("button", { name: "שינוי סיסמה" }));
    expect(await screen.findByText("הסיסמה הנוכחית שגויה")).toBeTruthy();
    expect(screen.queryByText("שם התצוגה עודכן")).toBeNull(); // one message at a time
  });
  it("password change logs out and goes to login", async () => {
    routes["/api/users/me/password"] = () => reply(204, null);
    routes["/api/auth/logout"] = () => reply(401, { detail: "יש להתחבר מחדש" });
    await renderProfile();
    fireEvent.change(screen.getByLabelText("סיסמה נוכחית"), { target: { value: "Password123!" } });
    fireEvent.change(screen.getByLabelText(/סיסמה חדשה/), { target: { value: "NewPassword1" } });
    fireEvent.click(screen.getByRole("button", { name: "שינוי סיסמה" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/login"));
    expect(localStorage.getItem("bloom_token")).toBeNull();
  });
  it("delete needs the typed confirmation", async () => {
    routes["/api/users/me"] = (m) => (m === "DELETE" ? reply(204, null) : reply(200, me));
    await renderProfile();
    const del = screen.getByRole("button", { name: "מחיקת החשבון לצמיתות" }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/כדי לאשר/), { target: { value: "מחק" } });
    expect(del.disabled).toBe(false);
    fireEvent.click(del);
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/"));
    expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/users/me")).toBe(true);
  });
});

const member = (m: Partial<Member>): Member => ({
  display_name: "דן", stage: "sprout", level: 1, level_exact: 1.5, last_score: 0.8, status: "focused",
  status_label: "מרוכז/ת", updated_at: "2026-01-01T00:00:00Z", is_me: false, ...m,
});

describe("RoomPanel (short polling)", () => {
  const myState = { sessionId: "S1", status: "tracking", onBreak: false };
  it("no room: invite button creates a room with my session", async () => {
    routes["/api/rooms"] = () => reply(201, { code: "ABC234", members: [member({ is_me: true })], cheers: [], shared_bloom: false, max_members: 4 });
    const onCreated = vi.fn();
    render(<RoomPanel code={null} me={myState} onCreated={onCreated} onLeft={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "הזמן חבר ללמוד איתך" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("ABC234"));
    expect(calls[0].body).toEqual({ session_id: "S1" });
  });
  it("polls every 3 s, shows the friend's status, reports presence, cheers, shows a received sun", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let friend = member({});
    let cheers: { id: string; from: string }[] = [];
    routes["/api/rooms/ABC234"] = () =>
      reply(200, { code: "ABC234", members: [member({ is_me: true, display_name: "נועה" }), friend], cheers, shared_bloom: false, max_members: 4 });
    routes["/api/rooms/ABC234/presence"] = () => reply(200, {});
    routes["/api/rooms/ABC234/cheer"] = () => reply(200, { sent: 1 });
    render(<RoomPanel code="ABC234" me={myState} onCreated={() => {}} onLeft={() => {}} />);
    expect((await screen.findByTestId("buddy-status")).textContent).toBe("מרוכז/ת");
    expect(screen.getByTestId("room-code").textContent).toBe("ABC234");
    expect(calls.find((c) => c.path.endsWith("/presence"))!.body).toEqual({ state: "active", session_id: "S1" });

    friend = member({ status: "needs_cheer", status_label: "צריך/ה עידוד", last_score: 0.2 });
    cheers = [{ id: "c1", from: "דן" }];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByTestId("buddy-status").textContent).toBe("צריך/ה עידוד");
    expect(screen.getByTestId("sun").textContent).toContain("דן שלח/ה לך עידוד!");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000); // the same cheer again: not shown twice
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.queryByTestId("sun")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "שלח עידוד 🌞" }));
    expect(await screen.findByText("העידוד נשלח ☀️")).toBeTruthy();
  });
  it("presence: break / no face / not started", async () => {
    routes["/api/rooms/R"] = () => reply(200, { code: "R", members: [], cheers: [], shared_bloom: false, max_members: 4 });
    routes["/api/rooms/R/presence"] = () => reply(200, {});
    const { rerender } = render(<RoomPanel code="R" me={{ sessionId: null, status: "loading", onBreak: false }} onCreated={() => {}} onLeft={() => {}} />);
    rerender(<RoomPanel code="R" me={{ sessionId: "S", status: "noface", onBreak: false }} onCreated={() => {}} onLeft={() => {}} />);
    rerender(<RoomPanel code="R" me={{ sessionId: "S", status: "tracking", onBreak: true }} onCreated={() => {}} onLeft={() => {}} />);
    await waitFor(() => expect(calls.filter((c) => c.path.endsWith("/presence")).map((c) => (c.body as { state: string }).state)).toEqual(["idle", "noface", "break"]));
  });
  it("expired room (404) -> message and leaves", async () => {
    const onLeft = vi.fn();
    render(<RoomPanel code="GONE22" me={myState} onCreated={() => {}} onLeft={onLeft} />);
    await waitFor(() => expect(onLeft).toHaveBeenCalled());
  });
  it("leave button", async () => {
    routes["/api/rooms/R"] = () => reply(200, { code: "R", members: [], cheers: [], shared_bloom: true, max_members: 4 });
    routes["/api/rooms/R/leave"] = () => reply(204, null);
    const onLeft = vi.fn();
    render(<RoomPanel code="R" me={myState} onCreated={() => {}} onLeft={onLeft} />);
    expect(await screen.findByText(/פרחנו ביחד!/)).toBeTruthy();
    expect(screen.getByText("מחכים שחבר/ה יצטרף/תצטרף דרך הקישור…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "יציאה מהחדר" }));
    await waitFor(() => expect(onLeft).toHaveBeenCalled());
  });
});

describe("RoomJoin", () => {
  const renderJoin = () =>
    render(<MemoryRouter initialEntries={["/room/abc234"]}><Routes><Route path="/room/:code" element={<RoomJoin />} /></Routes></MemoryRouter>);
  it("asks for consent, joins, then lists my content with room links", async () => {
    routes["/api/rooms/ABC234/join"] = () => reply(200, {});
    routes["/api/content"] = () => reply(200, [{ id: "c1", type: "text", title: "פרק", source: "x", bed: null, created_at: "", species: "fern" }]);
    renderJoin();
    expect(screen.getByText("ABC234")).toBeTruthy();
    expect(screen.getByText(/רק שם התצוגה, ציון הריכוז ושלב הצמח משותפים/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "אני מסכים/ה — הצטרפות לחדר" }));
    expect(await screen.findByRole("link", { name: "ללמוד בחדר" })).toBeTruthy();
    expect(calls.find((c) => c.path.endsWith("/join"))!.body).toEqual({ consent: true });
    expect(screen.getByRole("link", { name: "ללמוד בחדר" }).getAttribute("href")).toBe("/content/c1?room=ABC234");
    expect(sessionStorage.getItem("bloom_room")).toBe("ABC234");
  });
  it("full room -> the server's message", async () => {
    routes["/api/rooms/ABC234/join"] = () => reply(409, { detail: "החדר מלא (עד 4 משתתפים)" });
    renderJoin();
    fireEvent.click(screen.getByRole("button", { name: "אני מסכים/ה — הצטרפות לחדר" }));
    expect(await screen.findByText("החדר מלא (עד 4 משתתפים)")).toBeTruthy();
  });
});

describe("YouTubePlayer", () => {
  type Opts = { videoId: string; events: { onReady: (e: unknown) => void; onStateChange: (e: unknown) => void; onError: () => void } };
  let opts: Opts;
  let state = -1;
  let current = "VIDEO_ID_01";
  const player = {
    getCurrentTime: () => 12.5, getPlayerState: () => state, pauseVideo: vi.fn(), playVideo: vi.fn(), destroy: vi.fn(),
    getIframe: () => null, getVideoData: () => ({ video_id: current }),
  };
  beforeEach(() => {
    state = -1;
    current = "VIDEO_ID_01";
    window.YT = { Player: vi.fn((_el: HTMLElement, o: Opts) => ((opts = o), player)) } as never;
  });
  const fire = (data: number) => act(() => opts.events.onStateChange({ target: player, data }));

  it("maps player states to playback events and exposes time / pause / play", async () => {
    const onEvent = vi.fn();
    const ref = createRef<PlayerHandle>();
    const { unmount } = render(<YouTubePlayer ref={ref} videoId="VIDEO_ID_01" title="t" onEvent={onEvent} />);
    await waitFor(() => expect(window.YT!.Player).toHaveBeenCalled());
    fire(1);
    fire(3);
    fire(2);
    fire(0);
    act(() => opts.events.onError());
    expect(onEvent.mock.calls.map((c) => c[0].type)).toEqual(["PLAY", "BUFFERING", "PAUSE", "ENDED", "ERROR"]);
    state = 1;
    expect(ref.current!.isPlaying()).toBe(true);
    expect(ref.current!.getTime()).toBe(12.5);
    ref.current!.pause();
    ref.current!.play();
    expect(player.pauseVideo).toHaveBeenCalled();
    expect(player.playVideo).toHaveBeenCalled();
    unmount();
    expect(player.destroy).toHaveBeenCalled();
  });
  it("another video in the player is reported once and its events are ignored", async () => {
    const onEvent = vi.fn();
    render(<YouTubePlayer videoId="VIDEO_ID_01" title="t" onEvent={onEvent} />);
    await waitFor(() => expect(window.YT!.Player).toHaveBeenCalled());
    current = "OTHER_VIDEO";
    fire(1);
    fire(2);
    expect(onEvent.mock.calls.map((c) => c[0])).toEqual([{ type: "VIDEO_CHANGED", original: false, playing: true }]);
    current = "VIDEO_ID_01";
    fire(1);
    expect(onEvent.mock.calls.slice(1).map((c) => c[0])).toEqual([{ type: "VIDEO_CHANGED", original: true, playing: true }, { type: "PLAY" }]);
  });
  it("API script blocked -> plain embed + fallback callback", async () => {
    delete window.YT;
    const onFallback = vi.fn();
    const appendChild = vi.spyOn(document.head, "appendChild").mockImplementation((s) => {
      setTimeout(() => (s as HTMLScriptElement).onerror?.(new Event("error")), 0);
      return s;
    });
    const { container } = render(<YouTubePlayer videoId="VIDEO_ID_01" title="סרטון" onFallback={onFallback} />);
    await waitFor(() => expect(onFallback).toHaveBeenCalled());
    expect(container.querySelector("iframe")!.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/VIDEO_ID_01?rel=0");
    appendChild.mockRestore();
  });
});
