import { expect, test } from "@playwright/test";
import { addContent, apiLogin } from "./helpers";

/* Robustness: a camera exists but the permission prompt is NOT auto-accepted -> getUserMedia is denied. */
test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream"] }, permissions: [] });

test("clear message, no crash, the session can be ended", async ({ page, request }) => {
  const { token } = await apiLogin(page, request);
  const id = await addContent(request, token, { type: "text", title: "בלי מצלמה", source: "טקסט קצר." });
  await page.goto(`/content/${id}`);
  await page.getByRole("button", { name: "התחל סשן" }).click();
  await page.getByRole("button", { name: "אני מסכים" }).click();
  await expect(page.getByText("לא הצלחנו להפעיל את המצלמה. בדקו שנתתם הרשאה ושהמצלמה לא בשימוש.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("engine-status")).toHaveText("שגיאה");
  await page.getByRole("button", { name: "סיים סשן" }).click();
  await expect(page.getByText("הסשן הסתיים ונשמר בהיסטוריה.")).toBeVisible();
});
