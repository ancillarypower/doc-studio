import type { Page } from "@playwright/test";

export const NEW_URL = "http://localhost:4173/";
export const REF_URL = "http://localhost:4174/";
export const SECTIONS = ["header", "s1-upload", "s2-scan", "s3-password", "s4-method", "s5-preview", "s6-format", "s7-pagenum", "s8-watermark", "s9-output", "s10-log"];

/** Open a build and wait until it is visually settled (fonts loaded, network idle, no animation). */
export async function openSettled(page: Page, url: string) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator('[data-section="s10-log"]').waitFor();
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
  await page.waitForTimeout(300);
}

/** Upload a PDF through 壹區 and wait for the 貳區 scan to finish. */
export async function uploadPdf(page: Page, file: string) {
  await page.setInputFiles('input[type=file][accept*="pdf"]', file);
  await page.waitForFunction(() => !document.body.innerText.includes("掃描中"), null, { timeout: 30_000 });
  await page.waitForTimeout(500);
}
