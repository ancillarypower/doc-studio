import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { NEW_URL, REF_URL, SECTIONS, openSettled, uploadPdf } from "./helpers";

// Section-by-section visual gate (CI-VISUAL-GATE): two widths × two states, each section compared
// on its own so a 1px shift in one block can't sink every block below it.
//   pixels: pixelmatch threshold 0.1 (anti-aliasing ignored) → ≤ 2% of the section's pixels
//   layout: getBoundingClientRect x / y / width / height within ±4px
const WIDTHS = [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }];
const STATES = [{ name: "empty" }, { name: "all-triggers", file: "fixtures/all-triggers.pdf" }];
const MAX_DIFF = 0.02, MAX_PX = 4;
const cfg = JSON.parse(readFileSync("visual.config.json", "utf8")) as { mask: string[] };
const OUT = "visual-report";
mkdirSync(OUT, { recursive: true });

type Row = { section: string; viewport: string; state: string; diffPct: number; maxDeltaPx: number; pass: boolean; note?: string };
const rows: Row[] = [];

async function capture(page: Page, url: string, file?: string) {
  await openSettled(page, url);
  if (file) await uploadPdf(page, file);
  const shots: Record<string, { png: Buffer; box: { x: number; y: number; width: number; height: number } }> = {};
  for (const s of SECTIONS) {
    const loc = page.locator(`[data-section="${s}"]`);
    await loc.scrollIntoViewIfNeeded();
    // layout box relative to the document (the app scrolls inside #root)
    const box = await loc.evaluate((el) => {
      const r = el.getBoundingClientRect(); const root = document.getElementById("root")!;
      return { x: r.x + root.scrollLeft, y: r.y + root.scrollTop, width: r.width, height: r.height };
    });
    const png = await loc.screenshot({
      animations: "disabled",
      mask: [page.locator("[data-visual-ignore]"), ...cfg.mask.map((m) => page.locator(m))],
    });
    shots[s] = { png, box };
  }
  return shots;
}

function compare(a: Buffer, b: Buffer) {
  const A = PNG.sync.read(a), B = PNG.sync.read(b);
  const w = Math.max(A.width, B.width), h = Math.max(A.height, B.height);
  const pad = (p: PNG) => { const o = new PNG({ width: w, height: h }); o.data.fill(255); PNG.bitblt(p, o, 0, 0, p.width, p.height, 0, 0); return o; };
  const PA = pad(A), PB = pad(B), D = new PNG({ width: w, height: h });
  const n = pixelmatch(PA.data, PB.data, D.data, w, h, { threshold: 0.1, includeAA: false });
  return { pct: n / (w * h), diff: PNG.sync.write(D) };
}

for (const vp of WIDTHS) {
  for (const st of STATES) {
    test(`visual ${vp.name} · ${st.name}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, reducedMotion: "reduce", locale: "zh-TW", timezoneId: "Asia/Taipei" });
      const page = await ctx.newPage();
      const ref = await capture(page, REF_URL, st.file);
      const neu = await capture(page, NEW_URL, st.file);
      await ctx.close();
      for (const s of SECTIONS) {
        const tag = `${s}.${vp.name}.${st.name}`;
        const { pct, diff } = compare(ref[s].png, neu[s].png);
        const d = (k: "x" | "y" | "width" | "height") => Math.abs(ref[s].box[k] - neu[s].box[k]);
        const maxDeltaPx = Math.round(Math.max(d("x"), d("y"), d("width"), d("height")) * 10) / 10;
        const pass = pct <= MAX_DIFF && maxDeltaPx <= MAX_PX;
        rows.push({ section: s, viewport: vp.name, state: st.name, diffPct: Math.round(pct * 1000) / 10, maxDeltaPx, pass });
        writeFileSync(`${OUT}/${tag}.ref.png`, ref[s].png);
        writeFileSync(`${OUT}/${tag}.new.png`, neu[s].png);
        writeFileSync(`${OUT}/${tag}.diff.png`, diff);
      }
      writeFileSync(`${OUT}/visual-report.json`, JSON.stringify(rows, null, 2));
      const fails = rows.filter((r) => r.viewport === vp.name && r.state === st.name && !r.pass)
        .map((r) => `${r.section} ${r.viewport} ${r.diffPct}% / +${r.maxDeltaPx}px ❌`);
      expect(fails, "sections over the visual threshold").toEqual([]);
    });
  }
}

test.afterAll(() => {
  const line = rows.map((r) => `${r.section} ${r.viewport}/${r.state} ${r.diffPct}% / +${r.maxDeltaPx}px ${r.pass ? "✅" : "❌"}`).join("\n");
  writeFileSync(`${OUT}/summary.txt`, line + "\n");
});
