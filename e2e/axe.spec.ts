import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { NEW_URL, REF_URL, openSettled } from "./helpers";

// Gate: no critical/serious violations in the new build *beyond those the original artifact already had*.
// Phase A must look identical, so inherited issues (e.g. the artifact's low-contrast captions) are
// reported in axe-report.json and fixed in phase B instead of being silently restyled here.
test("axe: no new critical/serious violations vs. the artifact", async ({ page }) => {
  const run = async (url: string) => {
    await openSettled(page, url);
    const r = await new AxeBuilder({ page }).analyze();
    return r.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  };
  const ref = await run(REF_URL);
  const neu = await run(NEW_URL);
  // compare per rule: node counts (selectors differ slightly because of the v4 class renames)
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
