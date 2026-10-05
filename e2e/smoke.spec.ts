import { expect, test } from "@playwright/test";
import { NEW_URL, openSettled, uploadPdf } from "./helpers";

// Port of the artifact's own test, plus real flows on the synthetic fixtures.
test("loads without browser or network errors", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`exception: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`request failed: ${r.url()}`));
  page.on("response", (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  await openSettled(page, NEW_URL);
  await expect(page.locator("#root > *").first()).toBeAttached();
  expect(problems).toEqual([]);
});

test("all-triggers fixture: 貳區 lists every scanner finding", async ({ page }) => {
  await openSettled(page, NEW_URL);
  await uploadPdf(page, "fixtures/all-triggers.pdf");
  const scan = page.locator('[data-section="s2-scan"]');
  for (const label of ["中繼資料", "JavaScript", "附件", "連結", "EXIF", "隱藏圖層", "隱形文字", "數位簽章", "疑似藏字"]) {
    await expect(scan).toContainText(label);
  }
});

test("encrypted fixture: password unlocks the document", async ({ page }) => {
  await openSettled(page, NEW_URL);
  await page.setInputFiles('input[type=file][accept*="pdf"]', "fixtures/encrypted.pdf");
  const pw = page.locator('[data-section="s1-upload"] input[type=password]');
  await pw.waitFor({ timeout: 20_000 });
  await pw.fill("wrong-password");
  await pw.press("Enter");
  await expect(page.locator('[data-section="s1-upload"]')).toContainText("密碼不正確");
  await pw.fill("test1234");
  await pw.press("Enter");
  await expect(page.locator('[data-section="s3-password"]')).toContainText("下載解密後 PDF", { timeout: 20_000 });
});
