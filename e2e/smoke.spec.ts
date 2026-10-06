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

// #2: the app is branded 文件工坊 (tab title and header)
test("brand: title and header read 文件工坊", async ({ page }) => {
  await openSettled(page, NEW_URL);
  await expect(page).toHaveTitle("文件工坊");
  await expect(page.locator('[data-section="header"] h1')).toHaveText("文件工坊");
});

test("all-triggers fixture: 貳區 lists every scanner finding", async ({ page }) => {
  await openSettled(page, NEW_URL);
  await uploadPdf(page, "fixtures/all-triggers.pdf");
  const scan = page.locator('[data-section="s2-scan"]');
  // all 12 categories detected, so the 「未偵測到」 line must be absent
  await expect(scan).toContainText("偵測到 12 項");
  await expect(scan).not.toContainText("未偵測到");
  // row titles as rendered by ScanPanel (疑似藏字 is only the short name used in 未偵測到)
  for (const label of ["中繼資料", "舊版本", "JavaScript 與自動動作", "附件與內嵌檔案", "連結", "PieceInfo、書籤", "EXIF", "註解與表單", "隱藏圖層", "隱形文字", "數位簽章", "同色文字、被蓋住的文字"]) {
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
