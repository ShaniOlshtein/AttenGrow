// All browser-storage keys in one place. Every access is guarded: storage can throw
// (private mode, blocked site data) and the app must keep working without it.
export const KEYS = {
  token: "bloom_token", // localStorage: survives refresh
  autoPause: "bloom_autopause", // localStorage: "1" = pause the video on low focus
  crop: "bloom_crop", // localStorage: experimental face-crop input mode
  room: "bloom_room", // sessionStorage: the study room of this tab
  returnTo: "bloom_from", // sessionStorage: page to return to after login
} as const;

type Area = "local" | "session";
const area = (a: Area) => (a === "local" ? window.localStorage : window.sessionStorage);

export const storage = {
  get(key: string, a: Area = "local"): string | null {
    try {
      return area(a).getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string, a: Area = "local") {
    try {
      area(a).setItem(key, value);
    } catch {
      /* storage unavailable - the value just isn't remembered */
    }
  },
  remove(key: string, a: Area = "local") {
    try {
      area(a).removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
