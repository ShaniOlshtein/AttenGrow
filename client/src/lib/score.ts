// Score bands for the model output (0..1). Mirrors LOW_SCORE / FOCUS_THRESHOLD / GOOD_SCORE in server/app/config.py.
export const LOW_SCORE = 0.4; // below: not focused -> red, thirsty plant
export const FOCUS_THRESHOLD = 0.5; // at or above: counts as focused time, the plant grows
export const GOOD_SCORE = 0.7; // at or above: well focused -> green

export const scoreColor = (s: number) => (s < LOW_SCORE ? "var(--terra)" : s < GOOD_SCORE ? "var(--sun)" : "var(--leaf)");

export const scoreLabel = (s: number) =>
  s < 0.15 ? "לא מול המסך" : s < LOW_SCORE ? "לא מרוכז/ת" : s < 0.6 ? "ריכוז נמוך" : s < 0.85 ? "מרוכז/ת" : "מרוכז/ת מאוד";

/** flower color in the garden by the session's average score */
export function flowerColor(avg: number | null | undefined) {
  if (avg == null) return "#e8b4c8";
  if (avg >= GOOD_SCORE) return "#f2c14e";
  if (avg >= FOCUS_THRESHOLD) return "#ef8a62";
  return "#b39ddb";
}
