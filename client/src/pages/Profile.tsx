import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, tokenStore, User } from "../api";
import { useAuth } from "../auth";
import { FormMessage } from "../components/common";
import { errorMessage, passwordHint } from "../lib/text";

export default function Profile() {
  const { user, refresh, logout } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState(user?.display_name ?? "");
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [confirmText, setConfirmText] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string; where: string } | null>(null);

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api<User>("/api/users/me", { method: "PATCH", body: { display_name: name } });
      await refresh();
      setMsg({ kind: "ok", text: "שם התצוגה עודכן", where: "name" });
    } catch (err) {
      setMsg({ kind: "error", text: errorMessage(err), where: "name" });
    }
  };

  const changePw = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.new_password.length < 8) return setMsg({ kind: "error", text: "הסיסמה החדשה חייבת להכיל לפחות 8 תווים", where: "pw" });
    try {
      await api("/api/users/me/password", { method: "POST", body: pw });
      // all old tokens are now invalid -> log in again (clear first: the logout call must not trigger the 401 handler)
      tokenStore.clear();
      await logout();
      nav("/login", { replace: true, state: { registered: user?.email } });
    } catch (err) {
      setMsg({ kind: "error", text: errorMessage(err), where: "pw" });
    }
  };

  const deleteAccount = async () => {
    if (confirmText !== "מחק") return;
    try {
      await api("/api/users/me", { method: "DELETE" });
      tokenStore.clear();
      await logout();
      nav("/", { replace: true });
    } catch (err) {
      setMsg({ kind: "error", text: errorMessage(err), where: "del" });
    }
  };

  const msgFor = (where: string) => (msg?.where === where ? <FormMessage kind={msg.kind} text={msg.text} /> : null);

  return (
    <div className="stack narrow">
      <h1>פרופיל</h1>
      <p className="muted">{user?.email}</p>
      <form className="card stack" onSubmit={saveName}>
        <h2>שם תצוגה</h2>
        <label>שם תצוגה<input value={name} maxLength={50} onChange={(e) => setName(e.target.value)} /></label>
        {msgFor("name")}
        <button className="btn">שמירת שם</button>
      </form>
      <form className="card stack" onSubmit={changePw}>
        <h2>שינוי סיסמה</h2>
        <label>סיסמה נוכחית<input type="password" autoComplete="current-password" value={pw.current_password}
          onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></label>
        <label>סיסמה חדשה (לפחות 8 תווים)<input type="password" autoComplete="new-password" value={pw.new_password}
          onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
          <small className="muted">{passwordHint(pw.new_password)}</small></label>
        <p className="muted small">אחרי שינוי הסיסמה תתבקשו להתחבר מחדש בכל המכשירים.</p>
        {msgFor("pw")}
        <button className="btn">שינוי סיסמה</button>
      </form>
      <section className="card stack danger-zone">
        <h2>מחיקת חשבון</h2>
        <p>המחיקה סופית: כל התוכן, הסשנים, המדידות והגינה יימחקו ולא ניתן לשחזר.</p>
        <label>כדי לאשר, הקלידו <strong>מחק</strong><input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /></label>
        {msgFor("del")}
        <button className="btn danger" disabled={confirmText !== "מחק"} onClick={deleteAccount}>מחיקת החשבון לצמיתות</button>
      </section>
    </div>
  );
}
