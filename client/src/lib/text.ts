// Small pure helpers for user-facing text and navigation.

export function passwordHint(p: string) {
  if (!p) return "";
  if (p.length < 8) return `סיסמה קצרה מדי — לפחות 8 תווים (עכשיו ${p.length})`;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  return kinds >= 3 && p.length >= 12 ? "סיסמה חזקה 💪" : "טיפ: סיסמה ארוכה עם אותיות, ספרות וסימנים חזקה יותר";
}

/** Only same-site paths may be used as a post-login redirect ("//x", "/\x" or "https://x" could leave the site). */
export function safeRedirect(path: string | null | undefined, fallback = "/library") {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return fallback;
  return path;
}

export const fmtDate = (iso: string) => new Date(iso).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });

/** "m:ss" for a number of seconds */
export const fmtClock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** Message of any thrown value (ApiError messages are already Hebrew). */
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "משהו השתבש, נסו שוב");
