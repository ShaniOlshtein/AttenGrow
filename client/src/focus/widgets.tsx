import { useEffect } from "react";
import { GOOD_SCORE, LOW_SCORE, scoreColor, scoreLabel } from "../lib/score";

export function ConsentDialog({ onAgree, onDecline }: { onAgree: () => void; onDecline: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDecline();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDecline]);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="card modal">
        <h2 id="consent-title">הסכמה לשימוש במצלמה</h2>
        <p>כדי למדוד ריכוז נפעיל את המצלמה שלך בזמן הסשן.</p>
        <ul>
          <li>הווידאו ונקודות הפנים <strong>נשארים בדפדפן שלך</strong> ולא נשלחים לשום מקום.</li>
          <li>לשרת נשלח רק ציון ריכוז (מספר בין 0 ל-1) והמיקום בתוכן.</li>
          <li>אפשר לעצור בכל רגע עם "סיים סשן".</li>
        </ul>
        <div className="row">
          <button className="btn big" onClick={onAgree} autoFocus>אני מסכים</button>
          <button className="btn big ghost" onClick={onDecline}>לא, תודה</button>
        </div>
      </div>
    </div>
  );
}

export function ScoreMeter({ score, waitingText }: { score: number | null; waitingText?: string }) {
  const pct = score === null ? 0 : Math.round(score * 100);
  return (
    <div className="meter" aria-live="polite">
      <div className="meter-top">
        <span className="meter-num" data-testid="score">{score === null ? "—" : score.toFixed(2)}</span>
        <span className="muted">{score === null ? waitingText ?? "ממתין לציון ראשון…" : scoreLabel(score)}</span>
      </div>
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="ציון ריכוז">
        <div className="bar-fill" style={{ width: `${pct}%`, background: score === null ? "transparent" : scoreColor(score) }} />
      </div>
    </div>
  );
}

/** Tiny line chart (SVG) of scores 0..1. Used live (sparkline) and in history. */
export function ScoreChart({ points, height = 160, labels }: { points: number[]; height?: number; labels?: string[] }) {
  const w = 600;
  const pad = 24;
  if (points.length === 0) return <p className="muted">אין עדיין קריאות להצגה.</p>;
  const x = (i: number) => pad + (points.length === 1 ? (w - 2 * pad) / 2 : (i * (w - 2 * pad)) / (points.length - 1));
  const y = (v: number) => pad / 2 + (1 - v) * (height - pad);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${height}`} role="img" aria-label="גרף ציון ריכוז לאורך הזמן">
      {[LOW_SCORE, GOOD_SCORE].map((t) => (
        <g key={t}>
          <line x1={pad} x2={w - pad} y1={y(t)} y2={y(t)} className="chart-grid" />
          <text x={w - pad + 4} y={y(t) + 4} className="chart-tick">{t}</text>
        </g>
      ))}
      <path d={d} className="chart-line" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p)} r={3.5} fill={scoreColor(p)}>
          <title>{`${labels?.[i] ?? ""} ${p.toFixed(2)}`}</title>
        </circle>
      ))}
    </svg>
  );
}
