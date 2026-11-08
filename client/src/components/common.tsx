import { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LoadStatus } from "../hooks/useApi";
import { scoreColor } from "../lib/score";

export function Logo() {
  return (
    <Link to="/" className="brand" aria-label="פורחים - דף הבית">
      <img src="/logo.svg" alt="" width={36} height={36} />
      <span>פורחים</span>
    </Link>
  );
}

export function NotFound() {
  return (
    <div className="card center-card">
      <h1>לא נמצא</h1>
      <p className="muted">הדף או הפריט שחיפשת לא קיים, או שאין לך הרשאה אליו.</p>
      <Link className="btn" to="/library">
        חזרה לספרייה
      </Link>
    </div>
  );
}

export const Loading = () => <p className="muted">טוען…</p>;

/** Standard page states: loading → "לא נמצא" → error → the content. */
export function AsyncView({ status, error, children }: { status: LoadStatus; error: string; children: () => ReactNode }) {
  if (status === "loading") return <Loading />;
  if (status === "notfound") return <NotFound />;
  if (status === "error") return <p className="alert error">{error}</p>;
  return <>{children()}</>;
}

/** A score 0..1 in its band color, or "no readings". */
export const ScoreValue = ({ v }: { v: number | null }) =>
  v === null ? <span className="muted">אין מדידות</span> : <strong style={{ color: scoreColor(v) }}>{v.toFixed(2)}</strong>;

/** Form feedback: error (role=alert) or success (role=status). */
export function FormMessage({ kind, text }: { kind: "ok" | "error"; text: string }) {
  if (!text) return null;
  return (
    <p className={`alert ${kind}`} role={kind === "error" ? "alert" : "status"}>
      {text}
    </p>
  );
}
