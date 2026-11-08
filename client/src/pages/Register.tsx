import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Logo } from "../components/common";
import { errorMessage, passwordHint } from "../lib/text";

export default function Register() {
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", display_name: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.display_name.trim()) return setError("נא למלא שם תצוגה");
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError("כתובת האימייל לא תקינה");
    if (form.password.length < 8) return setError("הסיסמה חייבת להכיל לפחות 8 תווים");
    setBusy(true);
    try {
      await api("/api/auth/register", { method: "POST", body: { ...form, email: form.email.trim() } });
      nav("/login", { state: { registered: form.email.trim() } });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <form className="card auth-card" onSubmit={submit} noValidate>
        <Logo />
        <h1>הרשמה</h1>
        <label>
          שם תצוגה
          <input autoComplete="nickname" maxLength={50} value={form.display_name} onChange={set("display_name")} />
        </label>
        <label>
          אימייל
          <input type="email" autoComplete="email" value={form.email} onChange={set("email")} />
        </label>
        <label>
          סיסמה (לפחות 8 תווים)
          <input type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
          <small className="muted">{passwordHint(form.password)}</small>
        </label>
        {error && <p className="alert error" role="alert">{error}</p>}
        <button className="btn big" disabled={busy}>{busy ? "נרשם…" : "הרשמה"}</button>
        <p className="muted">כבר רשומים? <Link to="/login">להתחברות</Link></p>
      </form>
    </main>
  );
}
