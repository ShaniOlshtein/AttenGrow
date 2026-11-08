// @vitest-environment jsdom
/* Screens with the HTTP layer simulated (fetch mock answers like the server). */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth";
import Garden from "../pages/Garden";
import { HistoryDetail } from "../pages/History";
import JournalPage from "../pages/Journal";
import Library from "../pages/Library";
import Login from "../pages/Login";
import Register from "../pages/Register";

type Handler = (method: string, body: Record<string, unknown> | null) => Response | Promise<Response>;
let routes: Record<string, Handler> = {};
const calls: { method: string; path: string; body: unknown }[] = [];
const reply = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  routes = {};
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(init.body as string) : null;
    calls.push({ method: init.method ?? "GET", path, body });
    const key = Object.keys(routes).find((k) => path.split("?")[0] === k);
    return key ? routes[key](init.method ?? "GET", body) : reply(404, { detail: "לא נמצא" });
  }));
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname}</p>;
}
const at = (path: string, element: React.ReactNode, pattern = path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path={pattern} element={element} />
          <Route path="*" element={<Where />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );

describe("Register", () => {
  it("client-side checks before calling the server", () => {
    at("/register", <Register />);
    const submit = screen.getByRole("button", { name: "הרשמה" });
    fireEvent.click(submit);
    expect(screen.getByRole("alert").textContent).toBe("נא למלא שם תצוגה");
    fireEvent.change(screen.getByLabelText("שם תצוגה"), { target: { value: "נועה" } });
    fireEvent.change(screen.getByLabelText("אימייל"), { target: { value: "not-an-email" } });
    fireEvent.click(submit);
    expect(screen.getByRole("alert").textContent).toBe("כתובת האימייל לא תקינה");
    fireEvent.change(screen.getByLabelText("אימייל"), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText(/סיסמה/), { target: { value: "short" } });
    expect(screen.getByText("סיסמה קצרה מדי — לפחות 8 תווים (עכשיו 5)")).toBeTruthy();
    fireEvent.click(submit);
    expect(screen.getByRole("alert").textContent).toBe("הסיסמה חייבת להכיל לפחות 8 תווים");
    expect(calls).toHaveLength(0);
  });
  it("existing email -> the server's message; success -> login page", async () => {
    routes["/api/auth/register"] = (_m, b) =>
      b!.email === "taken@b.co" ? reply(409, { detail: "כתובת האימייל כבר רשומה" }) : reply(201, { id: "1" });
    at("/register", <Register />);
    fireEvent.change(screen.getByLabelText("שם תצוגה"), { target: { value: "נועה" } });
    fireEvent.change(screen.getByLabelText("אימייל"), { target: { value: " taken@b.co " } });
    fireEvent.change(screen.getByLabelText(/סיסמה/), { target: { value: "Password123!" } });
    fireEvent.click(screen.getByRole("button", { name: "הרשמה" }));
    expect(await screen.findByText("כתובת האימייל כבר רשומה")).toBeTruthy();
    expect(calls[0].body).toMatchObject({ email: "taken@b.co" }); // trimmed
    fireEvent.change(screen.getByLabelText("אימייל"), { target: { value: "new@b.co" } });
    fireEvent.click(screen.getByRole("button", { name: "הרשמה" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/login"));
  });
});

describe("Login", () => {
  it("wrong password shows the server message and stays", async () => {
    routes["/api/auth/login"] = () => reply(401, { detail: "אימייל או סיסמה שגויים" });
    at("/login", <Login />);
    fireEvent.change(screen.getByLabelText("אימייל"), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText("סיסמה"), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: "התחברות" }));
    expect(await screen.findByText("אימייל או סיסמה שגויים")).toBeTruthy();
    expect(localStorage.getItem("bloom_token")).toBeNull();
  });
  it("success stores the token and goes back to the saved page; unsafe saved pages fall back to the library", async () => {
    routes["/api/auth/login"] = () => reply(200, { access_token: "TOK", token_type: "bearer", expires_in: 3600 });
    routes["/api/users/me"] = () => reply(200, { id: "1", email: "a@b.co", display_name: "נועה", created_at: "" });
    sessionStorage.setItem("bloom_from", "//evil.example");
    at("/login", <Login />);
    fireEvent.change(screen.getByLabelText("אימייל"), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText("סיסמה"), { target: { value: "Password123!" } });
    fireEvent.click(screen.getByRole("button", { name: "התחברות" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/library"));
    expect(localStorage.getItem("bloom_token")).toBe("TOK");
    expect(sessionStorage.getItem("bloom_from")).toBeNull();
  });
});

describe("Library", () => {
  const item = { id: "c1", type: "youtube", title: "שיעור", source: "https://youtu.be/aqz-KE-bpKQ", bed: "מדע", created_at: "2026-01-01T10:00:00Z", species: "sunflower" };
  it("empty state, add (with the server's validation message), list, delete", async () => {
    let items: unknown[] = [];
    routes["/api/content"] = (m, b) => {
      if (m === "GET") return reply(200, items);
      if (b!.source === "https://bad") return reply(422, { detail: "קישור YouTube לא תקין" });
      items = [{ ...item, title: b!.title }];
      return reply(201, items[0]);
    };
    routes["/api/content/c1"] = () => {
      items = [];
      return reply(204, null);
    };
    at("/library", <Library />);
    expect(await screen.findByText(/הספרייה עוד ריקה/)).toBeTruthy();
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["סרטון YouTube", "טקסט", "דף אינטרנט"]);
    fireEvent.click(screen.getByRole("button", { name: "הוספת תוכן" }));
    expect(screen.getByRole("alert").textContent).toBe("נא למלא כותרת ותוכן/קישור");
    fireEvent.change(screen.getByLabelText("כותרת"), { target: { value: "שיעור" } });
    fireEvent.change(screen.getByLabelText("קישור"), { target: { value: "https://bad" } });
    fireEvent.click(screen.getByRole("button", { name: "הוספת תוכן" }));
    expect(await screen.findByText("קישור YouTube לא תקין")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("קישור"), { target: { value: "https://youtu.be/aqz-KE-bpKQ" } });
    fireEvent.click(screen.getByRole("button", { name: "הוספת תוכן" }));
    expect(await screen.findByText("התוכן נוסף לספרייה 🌱")).toBeTruthy();
    expect(await screen.findByRole("list", { name: "רשימת תוכן" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "פתח" }).getAttribute("href")).toBe("/content/c1");
    fireEvent.click(screen.getByRole("button", { name: "מחק" }));
    expect(window.confirm).toHaveBeenCalledWith('למחוק את "שיעור"?');
    expect(await screen.findByText(/הספרייה עוד ריקה/)).toBeTruthy();
  });
  it("text type shows a textarea", async () => {
    routes["/api/content"] = () => reply(200, []);
    at("/library", <Library />);
    fireEvent.change(screen.getByLabelText("סוג"), { target: { value: "text" } });
    expect(screen.getByLabelText("הטקסט").tagName).toBe("TEXTAREA");
  });
});

describe("History detail", () => {
  it("another user's / missing session -> 'לא נמצא'", async () => {
    at("/history/x", <HistoryDetail />, "/history/:id");
    expect(await screen.findByRole("heading", { name: "לא נמצא" })).toBeTruthy();
  });
  it("chart, positions and readings table", async () => {
    routes["/api/sessions/s1"] = () =>
      reply(200, {
        id: "s1", content_id: "c1", content_title: "שיעור", content_type: "youtube", bed: null,
        started_at: "2026-01-01T10:00:00Z", ended_at: "2026-01-01T10:05:00Z", reading_count: 2, average_score: 0.5,
        species: "sunflower", level: 1, level_exact: 1.2, stage: "sprout", blooms: 0, focused_seconds: 90, progress: 0.06, next_level_in: 4,
        readings: [
          { score: 0.3, position: 65, created_at: "2026-01-01T10:01:00Z" },
          { score: 0.7, position: 130, created_at: "2026-01-01T10:02:00Z" },
        ],
      });
    at("/history/s1", <HistoryDetail />, "/history/:id");
    expect(await screen.findByRole("heading", { name: "שיעור" })).toBeTruthy();
    expect(screen.getByText(/5 דק׳ · 2 מדידות/)).toBeTruthy();
    expect(screen.getByRole("img", { name: "גרף ציון ריכוז לאורך הזמן" })).toBeTruthy();
    const rows = screen.getAllByRole("row").slice(1).map((r) => r.textContent);
    expect(rows[0]).toContain("1:05");
    expect(rows[1]).toContain("2:10");
  });
});

describe("Garden and journal", () => {
  it("empty garden; season from the garden response (no badges call)", async () => {
    routes["/api/garden"] = () => reply(200, { beds: [], total_plants: 0, flowers: 0, shared_plants: [], season: { key: "autumn", name: "סתיו", emoji: "🍂" } });
    routes["/api/sessions"] = () => reply(200, []);
    at("/history", <Garden />);
    expect(await screen.findByText(/הגינה עוד ריקה/)).toBeTruthy();
    expect(screen.getByText("🍂 עונת סתיו")).toBeTruthy();
    expect(screen.getByText(/עוד אין סשנים/)).toBeTruthy();
    expect(calls.some((c) => c.path.startsWith("/api/badges"))).toBe(false);
    expect(calls.find((c) => c.path.startsWith("/api/garden"))!.path).toMatch(/tz_offset=-?\d+/);
  });
  it("beds with plants link to their sessions", async () => {
    routes["/api/garden"] = () =>
      reply(200, {
        total_plants: 1, flowers: 0, shared_plants: [{ room_code: "ABC", names: ["נועה", "דן"], created_at: "2026-01-01T10:00:00Z" }],
        season: { key: "spring", name: "אביב", emoji: "🌸" },
        beds: [{ name: "מדע", focused_minutes: 12.5, average_score: 0.66, plants: [
          { session_id: "s1", title: "שיעור", species: "fern", bed: "מדע", started_at: "2026-01-01T10:00:00Z", average_score: 0.66,
            focused_minutes: 12.5, level: 6, level_exact: 6.4, stage: "leaves", blooms: 0 }] }],
      });
    routes["/api/sessions"] = () => reply(200, []);
    at("/history", <Garden />);
    const bed = await screen.findByLabelText("ערוגה מדע");
    expect(bed.textContent).toContain("12.5 דק׳ מרוכזות · ממוצע 0.66");
    expect(bed.querySelector("a")!.getAttribute("href")).toBe("/history/s1");
    expect(screen.getByLabelText("ערוגה משותפת").textContent).toContain("נועה + דן");
  });
  it("journal: totals, tips, badges; an error is shown", async () => {
    routes["/api/journal"] = () =>
      reply(200, {
        minutes_by_day: Array.from({ length: 14 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, focused_minutes: i })),
        best_hour: 9, hour_averages: {}, by_bed: [{ name: "מדע", average_score: 0.7, focused_minutes: 5 }], streak: 3,
        attention_strips: [], tips: ["טיפ אחד"], totals: { sessions: 2, focused_minutes: 30, flowers: 1 },
      });
    routes["/api/badges"] = () => reply(200, { badges: [{ id: "first_seed", name: "זרע ראשון", emoji: "🌱", description: "d", earned: true }] });
    at("/journal", <JournalPage />);
    expect(await screen.findByText("09:00")).toBeTruthy();
    expect(screen.getByText("טיפ אחד")).toBeTruthy();
    expect(screen.getByText("3🔥")).toBeTruthy();
    expect((await screen.findByText("זרע ראשון")).closest(".badge")!.className).toContain("earned");
    cleanup();
    routes["/api/journal"] = () => reply(500, { detail: "שגיאת שרת, נסו שוב" });
    at("/journal", <JournalPage />);
    expect(await screen.findByText("שגיאת שרת, נסו שוב")).toBeTruthy();
  });
});
