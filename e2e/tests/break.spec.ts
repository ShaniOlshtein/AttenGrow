import { expect, test } from "@playwright/test";
import { addContent, apiLogin, fakeCamArgs } from "./helpers";

/* Earned break after a full bloom. Needs fast growth on the server:
   BLOOM_STEP_SECONDS=0.3 docker compose up -d server   (full bloom after ~3.6 focused seconds)
   BLOOM_FAST=1 npx playwright test break */
test.use({ launchOptions: { args: fakeCamArgs("face.y4m") } });
test.skip(process.env.BLOOM_FAST !== "1", "run with BLOOM_FAST=1 against a server with BLOOM_STEP_SECONDS=0.3");

test("full bloom → earned break with countdown, camera off → back to studying", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { token } = await apiLogin(page, request);
  const id = await addContent(request, token, { type: "text", title: "פריחה", source: "טקסט. ".repeat(200) });
  await page.addInitScript(() => (window.__bloomScoreOverride = 0.95));
  await page.goto(`/content/${id}`);
  await page.getByRole("button", { name: "התחל סשן" }).click();
  await page.getByRole("button", { name: "אני מסכים" }).click();

  const countdown = page.getByTestId("break-countdown");
  await expect(page.getByRole("heading", { name: /הרווחת הפסקה/ })).toBeVisible({ timeout: 60_000 });
  await expect(countdown).toHaveText(/^[45]:\d\d$/);
  const first = await countdown.textContent();
  await expect(countdown).not.toHaveText(first!, { timeout: 5_000 }); // it counts down
  // camera is off during the break: no live preview, no engine status
  await expect(page.getByTestId("engine-status")).toHaveCount(0);
  const cameraLive = await page.evaluate(() =>
    Array.from(document.querySelectorAll("video")).some((v) => (v.srcObject as MediaStream | null)?.active),
  );
  expect(cameraLive).toBe(false);

  await page.getByRole("button", { name: "חזרה ללמידה עכשיו" }).click();
  await expect(page.getByTestId("engine-status")).toBeVisible();
  await expect(page.getByTestId("score")).toHaveText(/\d\.\d\d/, { timeout: 30_000 });
  await page.getByRole("button", { name: "סיים סשן" }).click();
  await expect(page.getByText("הצמח נשתל בגינה")).toBeVisible();
});
