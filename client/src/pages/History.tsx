import { Link, useParams } from "react-router-dom";
import { AttentionStrip } from "../bloom/AttentionStrip";
import Plant, { SPECIES_NAME, STAGE_NAME } from "../bloom/Plant";
import { AsyncView, ScoreValue } from "../components/common";
import { duration } from "../components/HistoryList";
import { ScoreChart } from "../focus/widgets";
import { useApi } from "../hooks/useApi";
import { flowerColor } from "../lib/score";
import { fmtClock, fmtDate } from "../lib/text";
import type { Reading, SessionDetail } from "../types";

const fmtPos = (r: Reading, type: string | null) => (type === "text" ? `תו ${Math.round(r.position)}` : fmtClock(r.position));

export function HistoryDetail() {
  const { id } = useParams();
  const { status, data: s, error } = useApi<SessionDetail>(`/api/sessions/${id}`);
  return <AsyncView status={status} error={error}>{() => s && <SessionView s={s} />}</AsyncView>;
}

function SessionView({ s }: { s: SessionDetail }) {
  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h1>{s.content_title}</h1>
          <p className="muted">
            {fmtDate(s.started_at)} · {duration(s)} · {s.reading_count} מדידות · ממוצע <ScoreValue v={s.average_score} />
          </p>
        </div>
        <Link className="btn ghost" to="/history">
          חזרה לגינה
        </Link>
      </div>
      <section className="card plant-hero">
        <Plant level={s.level_exact ?? s.level} species={s.species} color={flowerColor(s.average_score)} mood="still" size={110} />
        <div>
          <h2>
            {SPECIES_NAME[s.species]} · {STAGE_NAME[s.stage]}
          </h2>
          <p>
            {Math.round(s.focused_seconds / 60)} דקות מרוכזות{s.blooms > 0 ? ` · פרח ${s.blooms} פעמים 🌼` : ""}
            {s.bed ? ` · ערוגה: ${s.bed}` : ""}
          </p>
        </div>
      </section>
      <section className="card">
        <h2>ציון לאורך הזמן</h2>
        <ScoreChart points={s.readings.map((r) => r.score)} labels={s.readings.map((r) => fmtPos(r, s.content_type))} />
      </section>
      {s.readings.some((r) => r.attention) && (
        <section className="card">
          <h2>אילו שניות נחשבו הכי הרבה?</h2>
          <p className="muted small">
            כל שורה = מדידה אחת; כל משבצת = פריים מתוך 10 השניות שהמודל ראה (ימין = מוקדם). כהה = משקל קשב גבוה.
          </p>
          <div className="strips">
            {s.readings
              .filter((r) => r.attention)
              .slice(-20)
              .map((r, i) => (
                <AttentionStrip key={i} weights={r.attention!} height={10} />
              ))}
          </div>
        </section>
      )}
      <section className="card">
        <h2>מדידות</h2>
        {s.readings.length === 0 ? (
          <p className="muted">לא נאספו מדידות בסשן הזה.</p>
        ) : (
          <table className="table" aria-label="מדידות">
            <thead>
              <tr>
                <th>#</th>
                <th>שעה</th>
                <th>מיקום בתוכן</th>
                <th>ציון</th>
              </tr>
            </thead>
            <tbody>
              {s.readings.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{new Date(r.created_at).toLocaleTimeString("he-IL")}</td>
                  <td>{fmtPos(r, s.content_type)}</td>
                  <td>
                    <ScoreValue v={r.score} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
