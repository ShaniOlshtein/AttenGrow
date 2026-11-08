// Same-origin, relative API calls. Token lives in localStorage so a refresh keeps the user logged in.
import type { Species } from "./bloom/Plant";
import { KEYS, storage } from "./lib/storage";

export const tokenStore = {
  get: () => storage.get(KEYS.token),
  set: (t: string) => storage.set(KEYS.token, t),
  clear: () => storage.remove(KEYS.token),
};

export class ApiError extends Error {
  /** status 0 = network error; code = the server's X-Error-Code (stable, unlike the Hebrew message) */
  constructor(
    public status: number,
    message: string,
    public code: string | null = null,
  ) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "אין חיבור לשרת. בדקו את החיבור ונסו שוב");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.detail === "string" ? data.detail : "משהו השתבש, נסו שוב";
    if (res.status === 401 && token && !path.startsWith("/api/auth/login")) {
      tokenStore.clear();
      onUnauthorized();
    }
    throw new ApiError(res.status, msg, res.headers.get("X-Error-Code"));
  }
  return data as T;
}

export type User = { id: string; email: string; display_name: string; created_at: string };
export type ContentType = "youtube" | "text" | "web";
export type Content = {
  id: string;
  type: ContentType;
  title: string;
  source: string;
  bed: string | null;
  created_at: string;
  species: Species;
  youtube_id?: string | null;
};

export const TYPE_LABEL: Record<ContentType, string> = { youtube: "סרטון YouTube", text: "טקסט", web: "דף אינטרנט" };
