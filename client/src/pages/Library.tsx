import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api, Content, ContentType, TYPE_LABEL } from "../api";
import { FormMessage, Loading } from "../components/common";
import { useApi } from "../hooks/useApi";
import { errorMessage, fmtDate } from "../lib/text";

const PLACEHOLDER: Record<ContentType, string> = {
  youtube: "https://www.youtube.com/watch?v=...",
  text: "הדביקו כאן את הטקסט לקריאה",
  web: "https://example.com/article",
};

export default function Library() {
  const { data: items, error: loadError, reload } = useApi<Content[]>("/api/content");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ type: "youtube" as ContentType, title: "", source: "", bed: "" });
  const [busy, setBusy] = useState(false);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMsg("");
    if (!form.title.trim() || !form.source.trim()) return setError("נא למלא כותרת ותוכן/קישור");
    setBusy(true);
    try {
      await api("/api/content", { method: "POST", body: { ...form, bed: form.bed || null } });
      setForm({ ...form, title: "", source: "" });
      setMsg("התוכן נוסף לספרייה 🌱");
      reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: Content) => {
    if (!confirm(`למחוק את "${c.title}"?`)) return;
    try {
      await api(`/api/content/${c.id}`, { method: "DELETE" });
      setMsg("התוכן נמחק");
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="grid-2">
      <section className="card">
        <h1>הספרייה שלי</h1>
        {loadError && <p className="alert error">{loadError}</p>}
        {items === null ? (
          !loadError && <Loading />
        ) : items.length === 0 ? (
          <p className="empty">הספרייה עוד ריקה. הוסיפו תוכן ראשון בטופס — וזרעו את הצמח הראשון 🌱</p>
        ) : (
          <ul className="list" aria-label="רשימת תוכן">
            {items.map((c) => (
              <li key={c.id} className="item">
                <Link to={`/content/${c.id}`} className="item-main">
                  <strong>{c.title}</strong>
                  <span className="muted small">
                    {TYPE_LABEL[c.type]} · {fmtDate(c.created_at)}
                    {c.bed ? ` · ערוגה: ${c.bed}` : ""}
                  </span>
                </Link>
                <Link className="btn small" to={`/content/${c.id}`}>פתח</Link>
                <button className="btn small danger" onClick={() => remove(c)}>מחק</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>הוספת תוכן</h2>
        <form onSubmit={add} className="stack" noValidate>
          <label>
            כותרת
            <input value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label>
            סוג
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ContentType })}>
              {(Object.keys(TYPE_LABEL) as ContentType[]).map((t) => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </select>
          </label>
          <label>
            {form.type === "text" ? "הטקסט" : "קישור"}
            {form.type === "text" ? (
              <textarea rows={6} value={form.source} placeholder={PLACEHOLDER.text}
                onChange={(e) => setForm({ ...form, source: e.target.value })} />
            ) : (
              <input dir="ltr" type="url" value={form.source} placeholder={PLACEHOLDER[form.type]}
                onChange={(e) => setForm({ ...form, source: e.target.value })} />
            )}
          </label>
          <label>
            ערוגה / נושא (לא חובה)
            <input value={form.bed} maxLength={40} placeholder="למשל: היסטוריה" list="beds"
              onChange={(e) => setForm({ ...form, bed: e.target.value })} />
            <datalist id="beds">
              {[...new Set((items ?? []).map((c) => c.bed).filter(Boolean))].map((b) => <option key={b!} value={b!} />)}
            </datalist>
          </label>
          <FormMessage kind="error" text={error} />
          <FormMessage kind="ok" text={msg} />
          <button className="btn big" disabled={busy}>{busy ? "מוסיף…" : "הוספת תוכן"}</button>
        </form>
      </section>
    </div>
  );
}
