/* Presentational parts of the watch-screen session panel (no state of their own). */
import { Link } from "react-router-dom";
import Plant, { Mood, Species, STAGE_NAME } from "../bloom/Plant";
import { fmtClock } from "../lib/text";
import type { Growth } from "../types";
import { focusedText, SessionPhase } from "./focusLogic";

export type EndSummary = Growth & { reading_count: number; average_score: number | null };

const stageName = (stage: string) => STAGE_NAME[stage] ?? "זרע";

export function PlantStage(p: { level: number; species: Species; mood: Mood; reviving: boolean; growth: Growth; showProgress: boolean; grew: boolean }) {
  const pct = Math.round(Math.min(1, p.growth.progress) * 100);
  return (
    <div className="plant-stage">
      <Plant level={p.level} species={p.species} mood={p.mood} reviving={p.reviving} size={150}
        label={`הצמח שלך: ${stageName(p.growth.stage)}`} />
      {p.showProgress && (
        <>
          <p className="plant-caption" data-testid="plant-stage">
            {stageName(p.growth.stage)} · {focusedText(p.growth.focused_seconds)} מרוכזות
          </p>
          <div className="bloom-progress" aria-label={`התקדמות לפריחה: ${pct}%`} data-testid="bloom-progress">
            <div className="bar small-bar">
              <div className="bar-fill" style={{ width: `${pct}%`, background: "var(--leaf-2)" }} />
            </div>
            <span className="muted small">
              לפריחה: {pct}%{p.grew ? " 🌱+" : ""}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/** Before a session / after declining consent / after the session ended. */
export function SessionIntro({ phase, summary, onStart }: { phase: SessionPhase; summary: EndSummary | null; onStart: () => void }) {
  return (
    <div className="stack">
      {phase === "idle" && <p className="muted small center-text">כל סשן שותל זרע — והוא גדל רק כשאת/ה מרוכז/ת.</p>}
      {phase === "declined" && (
        <p className="alert warn" role="status">
          בחרת לצפות בלי מדידה — זה בסדר גמור. בלי מצלמה לא נוכל למדוד ריכוז או לגדל צמח. אפשר להתחיל מדידה בכל רגע.
        </p>
      )}
      {phase === "ended" && summary && (
        <div className="alert ok" role="status">
          <strong>הסשן הסתיים ונשמר בהיסטוריה.</strong>{" "}
          {summary.reading_count > 0
            ? `${summary.reading_count} מדידות · ממוצע ${summary.average_score?.toFixed(2)}`
            : "לא נאספו מדידות בסשן הזה."}{" "}
          הצמח נשתל בגינה 🌱 <Link to="/history">לגינה שלי</Link>
        </div>
      )}
      <button className="btn big" onClick={onStart}>
        {phase === "ended" ? "התחל סשן חדש" : "התחל סשן"}
      </button>
    </div>
  );
}

export function BreakBox({ secondsLeft, busy, onResume, onEnd }: { secondsLeft: number; busy: boolean; onResume: () => void; onEnd: () => void }) {
  return (
    <div className="break-box" role="status">
      <h3>☀️ הרווחת הפסקה!</h3>
      <p>הצמח פרח. המצלמה כבויה — קומו, תשתו מים, תזוזו קצת.</p>
      <div className="countdown" data-testid="break-countdown">
        {fmtClock(secondsLeft)}
      </div>
      <div className="row center">
        <button className="btn" onClick={onResume}>
          {secondsLeft > 0 ? "חזרה ללמידה עכשיו" : "חזרה ללמידה"}
        </button>
        <button className="btn danger" onClick={onEnd} disabled={busy}>
          סיים סשן
        </button>
      </div>
    </div>
  );
}

export function CameraControls(p: {
  cameras: MediaDeviceInfo[];
  cameraId: string;
  onCamera: (id: string) => void;
  autoPause: boolean | null; // null = the content can't be paused (text / web)
  onAutoPause: (on: boolean) => void;
}) {
  return (
    <div className="stack cam-select">
      <label>
        מצלמה
        <select value={p.cameraId} onChange={(e) => p.onCamera(e.target.value)}>
          {p.cameras.length === 0 && <option value="">מצלמת ברירת מחדל</option>}
          {p.cameras.map((c, i) => (
            <option key={c.deviceId || i} value={c.deviceId}>
              {c.label || `מצלמה ${i + 1}`}
            </option>
          ))}
        </select>
      </label>
      {p.autoPause !== null && (
        <label className="check">
          <input type="checkbox" checked={p.autoPause} onChange={(e) => p.onAutoPause(e.target.checked)} />
          לעצור את הסרטון כשהריכוז נמוך
        </label>
      )}
    </div>
  );
}
