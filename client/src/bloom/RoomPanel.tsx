import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { useFlash } from "../hooks/useFlash";
import { errorMessage } from "../lib/text";
import Plant, { Mood, STAGE_NAME } from "./Plant";

export type Member = {
  display_name: string;
  stage: string;
  level: number;
  level_exact?: number;
  last_score: number | null;
  status: "focused" | "needs_cheer" | "away" | "break" | "idle";
  status_label: string;
  updated_at: string;
  is_me: boolean;
};
type Room = { code: string; members: Member[]; cheers: { id: string; from: string }[]; shared_bloom: boolean; max_members: number };
export type MyState = { sessionId: string | null; status: string; onBreak: boolean };

const POLL_MS = 3000;
const ROOM_TTL_HOURS = 4; // mirrors ROOM_TTL_HOURS in server/app/config.py
const SUN_MS = 3500;
const NOTE_MS = 2500;
const COPIED_MS = 2000;
const MOOD: Record<Member["status"], Mood> = { focused: "grow", needs_cheer: "droop", away: "sleep", break: "still", idle: "still" };

export default function RoomPanel({ code, me, onCreated, onLeft }: {
  code: string | null;
  me: MyState;
  onCreated: (code: string) => void;
  onLeft: () => void;
}) {
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState("");
  const [copied, flashCopied] = useFlash(COPIED_MS, false);
  const [sun, flashSun] = useFlash<string | null>(SUN_MS, null);
  const [cheerMsg, flashCheerMsg] = useFlash(NOTE_MS, "");
  const seen = useRef(new Set<string>());
  const lastPresence = useRef("");

  // short polling (works with any number of server instances - state lives in Mongo)
  useEffect(() => {
    if (!code) return;
    let alive = true;
    const poll = async () => {
      try {
        const r = await api<Room>(`/api/rooms/${code}`);
        if (!alive) return;
        setRoom(r);
        setError("");
        const fresh = r.cheers.filter((c) => !seen.current.has(c.id));
        fresh.forEach((c) => seen.current.add(c.id));
        if (fresh.length) flashSun(fresh[fresh.length - 1].from);
      } catch (e) {
        if (!alive) return;
        if ((e as ApiError).status === 404) {
          setError(`החדר לא קיים יותר (אולי פג תוקפו אחרי ${ROOM_TTL_HOURS} שעות ללא פעילות).`);
          setRoom(null);
          onLeft();
        }
      }
    };
    poll();
    const t = window.setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart polling only when the room changes
  }, [code]);

  // tell the room about states the server can't see from readings (no face / on a break / not started)
  useEffect(() => {
    if (!code) return;
    const state = me.onBreak ? "break" : !me.sessionId ? "idle" : me.status === "noface" ? "noface" : "active";
    const key = `${state}|${me.sessionId}`;
    if (key === lastPresence.current) return;
    lastPresence.current = key;
    api(`/api/rooms/${code}/presence`, { method: "POST", body: { state, session_id: me.sessionId } }).catch(() => {});
  }, [code, me.onBreak, me.sessionId, me.status]);

  const create = async () => {
    setError("");
    try {
      const r = await api<Room>("/api/rooms", { method: "POST", body: { session_id: me.sessionId } });
      setRoom(r);
      onCreated(r.code);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const leave = async () => {
    if (!code) return;
    await api(`/api/rooms/${code}/leave`, { method: "POST" }).catch(() => {});
    setRoom(null);
    onLeft();
  };

  const cheer = async () => {
    try {
      await api(`/api/rooms/${code}/cheer`, { method: "POST" });
      flashCheerMsg("העידוד נשלח ☀️");
    } catch (e) {
      flashCheerMsg(errorMessage(e));
    }
  };

  const link = code ? `${location.origin}/room/${code}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      flashCopied(true);
    } catch {
      /* clipboard blocked - the link is visible anyway */
    }
  };

  if (!code)
    return (
      <section className="card room" aria-label="לומדים ביחד">
        <h2>לומדים ביחד 🤝</h2>
        <p className="muted small">הזמינו חבר/ה — כל אחד לומד את התוכן שלו, ורואים את הצמחים אחד של השני גדלים.</p>
        {error && <p className="alert error">{error}</p>}
        <button className="btn" onClick={create}>הזמן חבר ללמוד איתך</button>
      </section>
    );

  const others = room?.members.filter((m) => !m.is_me) ?? [];
  return (
    <section className="card room" aria-label="לומדים ביחד">
      {sun && (
        <div className="sun-burst" role="status" data-testid="sun">
          <span className="sun">☀️</span>
          <span>{sun} שלח/ה לך עידוד!</span>
        </div>
      )}
      <div className="row between">
        <h2>לומדים ביחד 🤝</h2>
        <button className="btn small ghost" onClick={leave}>יציאה מהחדר</button>
      </div>
      <div className="room-code">
        <span>קוד החדר: <strong data-testid="room-code" dir="ltr">{code}</strong></span>
        <input readOnly value={link} dir="ltr" aria-label="קישור הזמנה" onFocus={(e) => e.target.select()} />
        <button className="btn small" onClick={copy}>{copied ? "הועתק ✓" : "העתקת קישור"}</button>
      </div>
      {error && <p className="alert error">{error}</p>}
      {room?.shared_bloom && <p className="alert ok" role="status">🌼 פרחנו ביחד! צמח משותף נשתל בגינה של כולם.</p>}
      {others.length === 0 ? (
        <p className="muted small">מחכים שחבר/ה יצטרף/תצטרף דרך הקישור…</p>
      ) : (
        <ul className="buddies" aria-label="חברים בחדר">
          {others.map((m, i) => (
            <li key={`${i}-${m.display_name}`} className={`buddy st-${m.status}`} data-testid="buddy">
              <Plant level={m.level_exact ?? m.level} mood={MOOD[m.status]} size={64} label={`הצמח של ${m.display_name}`} />
              <div className="buddy-info">
                <strong>{m.display_name}</strong>
                <span className="buddy-status" data-testid="buddy-status">{m.status_label}</span>
                <span className="muted small">
                  {STAGE_NAME[m.stage]}{m.last_score !== null && m.status !== "away" ? ` · ${m.last_score.toFixed(2)}` : ""}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <div className="row">
          <button className="btn" onClick={cheer}>שלח עידוד 🌞</button>
          {cheerMsg && <span className="muted small" role="status">{cheerMsg}</span>}
        </div>
      )}
      <p className="muted small">משותפים רק שם התצוגה, ציון הריכוז ושלב הצמח — בלי וידאו ובלי נקודות פנים.</p>
    </section>
  );
}
