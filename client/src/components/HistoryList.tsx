import { Link } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { fmtDate } from "../lib/text";
import type { SessionSummary } from "../types";
import { Loading, ScoreValue } from "./common";

export const duration = (s: SessionSummary) => {
  if (!s.ended_at) return "פעיל";
  const m = Math.round((+new Date(s.ended_at) - +new Date(s.started_at)) / 60000);
  return m < 1 ? "פחות מדקה" : `${m} דק׳`;
};

/** Plain sessions list (date, content title, average) - the base "history" requirement. */
export default function HistoryList() {
  const { data: items, error } = useApi<SessionSummary[]>("/api/sessions");
  return (
    <section className="card">
      <h2>היסטוריה — כל הסשנים</h2>
      {error && <p className="alert error">{error}</p>}
      {items === null ? (
        !error && <Loading />
      ) : items.length === 0 ? (
        <p className="empty">עוד אין סשנים. פתחו תוכן מהספרייה ולחצו "התחל סשן".</p>
      ) : (
        <table className="table" aria-label="רשימת סשנים">
          <thead>
            <tr>
              <th>תאריך</th>
              <th>תוכן</th>
              <th>משך</th>
              <th>מדידות</th>
              <th>ממוצע</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link to={`/history/${s.id}`}>{fmtDate(s.started_at)}</Link>
                </td>
                <td>
                  <Link to={`/history/${s.id}`}>{s.content_title}</Link>
                </td>
                <td>{duration(s)}</td>
                <td>{s.reading_count}</td>
                <td>
                  <ScoreValue v={s.average_score} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
