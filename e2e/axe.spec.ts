import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { NEW_URL, REF_URL, openSettled, uploadPdf } from "./helpers";

// Preserve the relative gate for other serious/critical rules. Contrast has an
// independent absolute gate below, so inherited failures cannot be grandfathered in.
test("axe: no new critical/serious violations vs. the artifact", async ({ page }) => {
  const run = async (url: string) => {
    await openSettled(page, url);
    const r = await new AxeBuilder({ page }).analyze();
    return r.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  };
  const ref = await run(REF_URL);
  const neu = await run(NEW_URL);
  const count = (vs: typeof ref) => Object.fromEntries(vs.map((v) => [v.id, v.nodes.length]));
  const refN = count(ref), newN = count(neu);
  const added = Object.entries(newN).filter(([id, n]) => n > (refN[id] ?? 0)).map(([id, n]) => `${id}: ${refN[id] ?? 0} → ${n}`);
  mkdirSync("visual-report", { recursive: true });
  writeFileSync("visual-report/axe-report.json", JSON.stringify({
    inherited: ref.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })),
    new: neu.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })),
    added,
  }, null, 2));
  expect(added, "critical/serious axe violations introduced by the port").toEqual([]);
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`axe: zero color-contrast violations at ${viewport.width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await openSettled(page, NEW_URL);
    const reports = [];
    for (const state of ["initial", "uploaded", "sanitization-selected"]) {
      if (state === "uploaded") await uploadPdf(page, "fixtures/all-triggers.pdf");
      if (state === "sanitization-selected") {
        await page.locator('[data-section="s2-scan"]').getByRole("button", { name: "全部勾選淨化", exact: true }).click();
        await expect(page.locator('[data-section="s2-scan"]').getByRole("checkbox", { name: "刪除", exact: true }).first()).toBeChecked();
      }
      const result = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      // Keep axe's computed foreground/background, ancestor-opacity explanation,
      // selectors and failure summaries, including nodes requiring manual review.
      reports.push({ state, viewport, violations: result.violations, incomplete: result.incomplete });
      const failures = result.violations.flatMap((v) => v.nodes.map((n) => ({
        target: n.target, html: n.html, failureSummary: n.failureSummary,
        checks: [...n.any, ...n.all, ...n.none].map((c) => ({ id: c.id, data: c.data, message: c.message })),
      })));
      expect.soft(failures, `${viewport.width}px ${state}: color-contrast must be zero`).toEqual([]);
    }
    const report = JSON.stringify(reports, null, 2);
    mkdirSync("visual-report", { recursive: true });
    writeFileSync(`visual-report/contrast-${viewport.width}.json`, report);
    await testInfo.attach(`contrast-${viewport.width}`, { body: report, contentType: "application/json" });
  });
}
