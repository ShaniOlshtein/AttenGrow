import { describe, expect, it } from "vitest";
import { flowerColor, scoreColor, scoreLabel } from "./score";
import { fmtClock, passwordHint, safeRedirect } from "./text";

describe("score bands", () => {
  it("colors: red < 0.4 <= yellow < 0.7 <= green", () => {
    expect(scoreColor(0.39)).toBe("var(--terra)");
    expect(scoreColor(0.4)).toBe("var(--sun)");
    expect(scoreColor(0.69)).toBe("var(--sun)");
    expect(scoreColor(0.7)).toBe("var(--leaf)");
  });
  it("labels", () => {
    expect(scoreLabel(0.05)).toBe("לא מול המסך");
    expect(scoreLabel(0.3)).toBe("לא מרוכז/ת");
    expect(scoreLabel(0.5)).toBe("ריכוז נמוך");
    expect(scoreLabel(0.7)).toBe("מרוכז/ת");
    expect(scoreLabel(0.95)).toBe("מרוכז/ת מאוד");
  });
  it("flower color by average", () => {
    expect(flowerColor(null)).toBe("#e8b4c8");
    expect(flowerColor(0.75)).toBe("#f2c14e");
    expect(flowerColor(0.55)).toBe("#ef8a62");
    expect(flowerColor(0.2)).toBe("#b39ddb");
  });
});

describe("safeRedirect", () => {
  it("keeps same-site paths", () => {
    expect(safeRedirect("/content/abc?room=X")).toBe("/content/abc?room=X");
  });
  it("rejects anything that could leave the site", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil", "", null, undefined])
      expect(safeRedirect(bad)).toBe("/library");
  });
});

describe("text helpers", () => {
  it("password hint", () => {
    expect(passwordHint("")).toBe("");
    expect(passwordHint("abc")).toContain("(עכשיו 3)");
    expect(passwordHint("Abcdefgh1234!")).toBe("סיסמה חזקה 💪");
  });
  it("clock", () => {
    expect(fmtClock(300)).toBe("5:00");
    expect(fmtClock(65.9)).toBe("1:05");
  });
});
