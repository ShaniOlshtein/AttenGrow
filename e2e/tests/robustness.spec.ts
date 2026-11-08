import { expect, test } from "@playwright/test";
import { addContent, apiLogin, fakeCamArgs } from "./helpers";

/* Robustness in a real browser: the model file failing to load, the server failing while measuring,
   missing / foreign items. (Camera permission denied: camera-denied.spec.ts) */
test.use({ launchOptions: { args: fakeCamArgs("face.y4m") } });

test("the model file fails to load: clear message, the page keeps working", async ({ page, request }) => {
  const { token } = await apiLogin(page, request);
  const id = await addContent(request, token, { type: "text", title: "בלי מודל", source: "טקסט קצר." });
  await page.route("**/models/*.onnx", (r) => r.abort());
  await page.goto(`/content/${id}`);
  await page.getByRole("button", { name: "התחל סשן" }).click();
  await page.getByRole("button", { name: "אני מסכים" }).click();
  await expect(page.getByText("טעינת מודל הריכוז נכשלה. רעננו את הדף ונסו שוב.")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: "חזרה לספרייה" }).click();
  await expect(page.getByRole("heading", { name: "הספרייה שלי" })).toBeVisible();
});

test("the server fails to save readings: the live score keeps updating, the session still ends", async ({ page, request }) => {
  const { token } = await apiLogin(page, request);
  const id = await addContent(request, token, { type: "text", title: "שרת תקול", source: "טקסט קצר." });
  await page.route("**/api/sessions/*/readings", (r) => r.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"שגיאת שרת, נסו שוב"}' }));
  await page.goto(`/content/${id}`);
  await page.getByRole("button", { name: "התחל סשן" }).click();
  await page.getByRole("button", { name: "אני מסכים" }).click();
  const score = page.getByTestId("score");
  await expect(score).toHaveText(/^(0\.\d\d|1\.00)$/, { timeout: 30_000 });
  await page.waitForResponse("**/api/sessions/*/readings");
  await page.waitForResponse("**/api/sessions/*/readings", { timeout: 10_000 }); // still measuring after a failure
  await page.unroute("**/api/sessions/*/readings");
  await page.getByRole("button", { name: "סיים סשן" }).click();
  await expect(page.getByText("הסשן הסתיים ונשמר בהיסטוריה.")).toBeVisible();
});

test("an item that does not exist / belongs to someone else shows 'לא נמצא'", async ({ page, request }) => {
  await apiLogin(page, request);
  await page.goto("/content/000000000000000000000000");
  await expect(page.getByRole("heading", { name: "לא נמצא" })).toBeVisible();
  await page.goto("/history/not-an-id");
  await expect(page.getByRole("heading", { name: "לא נמצא" })).toBeVisible();
});
