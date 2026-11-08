import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Content, TYPE_LABEL } from "../api";
import { KEYS, storage } from "../lib/storage";
import { errorMessage } from "../lib/text";

export default function RoomJoin() {
  const { code: rawCode = "" } = useParams();
  const code = rawCode.toUpperCase();
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<Content[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // already a member? skip the consent step
    api(`/api/rooms/${code}`).then(() => setJoined(true)).catch(() => {});
  }, [code]);

  useEffect(() => {
    if (joined) {
      storage.set(KEYS.room, code, "session");
      api<Content[]>("/api/content").then(setItems).catch((e) => setError(errorMessage(e)));
    }
  }, [joined, code]);

  const join = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/rooms/${code}/join`, { method: "POST", body: { consent: true } });
      setJoined(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack narrow">
      <h1>לומדים ביחד 🤝</h1>
      {!joined ? (
        <section className="card stack">
          <p>הוזמנת ללמוד בחדר <strong dir="ltr">{code}</strong>. כל אחד לומד את התוכן שלו ורואה את הצמח של החברים גדל.</p>
          <p className="alert warn">
            🔒 רק שם התצוגה, ציון הריכוז ושלב הצמח משותפים — בלי וידאו ובלי נקודות פנים. אפשר לצאת מהחדר בכל רגע.
          </p>
          {error && <p className="alert error" role="alert">{error}</p>}
          <div className="row">
            <button className="btn big" onClick={join} disabled={busy}>אני מסכים/ה — הצטרפות לחדר</button>
            <Link className="btn big ghost" to="/library">לא עכשיו</Link>
          </div>
        </section>
      ) : (
        <section className="card stack">
          <p className="alert ok" role="status">הצטרפת לחדר! עכשיו בחרו מה ללמוד (אפשר תוכן שונה מהחבר/ה):</p>
          {error && <p className="alert error">{error}</p>}
          {items === null ? <p className="muted">טוען…</p> : items.length === 0 ? (
            <p className="empty">הספרייה שלך ריקה. <Link to="/library">הוסיפו תוכן בספרייה</Link> — החדר יחכה לכם.</p>
          ) : (
            <ul className="list" aria-label="בחירת תוכן ללמידה בחדר">
              {items.map((c) => (
                <li key={c.id} className="item">
                  <Link className="item-main" to={`/content/${c.id}?room=${code}`}>
                    <strong>{c.title}</strong>
                    <span className="muted small">{TYPE_LABEL[c.type]}</span>
                  </Link>
                  <Link className="btn small" to={`/content/${c.id}?room=${code}`}>ללמוד בחדר</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
