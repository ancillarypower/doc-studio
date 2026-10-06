import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fmtPages, sanSummary, SAN_DEFAULT } from "../src/components/ScanPanel";
import { clampTarget, fmtBytes, repairMojibake, sanitizeBase } from "../src/lib/helpers";
import { decryptPdf, probeEncryption } from "../src/pdf/crypt.js";
import { sanitizePdf, scanPdf } from "../src/pdf/sanitize.js";

const KEYS = ["meta", "history", "js", "attach", "links", "piece", "exif", "annots", "layers", "invisible", "sig", "hiddenText"] as const;
const load = (f: string) => new Uint8Array(readFileSync(`fixtures/${f}`));

describe("helpers", () => {
  it("formats page runs", () => { expect(fmtPages([2, 3, 4, 7])).toBe("第 2–4、7 頁"); expect(fmtPages([])).toBe(""); });
  it("summarises sanitize options", () => {
    expect(sanSummary(SAN_DEFAULT)).toBe("");
    expect(sanSummary({ ...SAN_DEFAULT, js: true, links: "external" })).toBe("JavaScript 與自動動作、外部連結、只保留現行版本");
  });
  it("clamps target sizes per unit", () => { expect(clampTarget(0, "MB")).toBe(0.05); expect(clampTarget("x", "KB")).toBe(2048); });
  it("formats bytes", () => { expect(fmtBytes(2048)).toBe("2 KB"); expect(fmtBytes(3 * 1048576)).toBe("3.0 MB"); });
  it("sanitizes file names", () => { expect(sanitizeBase(' ..a/b:c*d. ')).toBe("abcd"); });
  it("repairs Big5 mojibake", () => {
    const big5 = new Uint8Array([0xa4, 0xa4, 0xa4, 0xe5, 0x2e, 0x70, 0x64, 0x66]); // 中文.pdf
    expect(repairMojibake(String.fromCharCode(...big5))).toBe("中文.pdf");
  });
});

describe("fixtures × engine", () => {
  it("all-triggers.pdf trips every scanner category", async () => {
    const r = await scanPdf(load("all-triggers.pdf"));
    for (const k of KEYS) expect(r[k].detected, k).toBe(true);
    expect(r.exif.gps).toBe(1);
  });
  it("full purge clears every category it has an option for", async () => {
    const all = { meta: true, history: true, js: true, attach: true, links: "all", piece: true, outlines: true, exif: true, flatten: true, ocg: true, invisible: true };
    const s = await sanitizePdf(load("all-triggers.pdf"), all);
    const r = await scanPdf(s.bytes);
    // hiddenText is report-only (僅提醒), so it is the only category allowed to survive a full purge
    for (const k of KEYS.filter((k) => k !== "hiddenText")) expect(r[k].detected, k).toBe(false);
    // #7: purging metadata drops the trailer /ID instead of regenerating it, so 中繼資料 rescans clean
    expect(r.meta.fields).toEqual([]);
    expect(r.meta.xmpCount).toBe(0);
    expect(r.meta.hasId).toBe(false);
  });
  it("keeps the original /ID when metadata is not purged", async () => {
    const s = await sanitizePdf(load("all-triggers.pdf"), { meta: false, js: true });
    const r = await scanPdf(s.bytes);
    expect(r.meta.hasId).toBe(true);
    expect(r.meta.detected).toBe(true);
  });
  it("encrypted.pdf: RC4-128, user password unlocks, wrong password does not", async () => {
    const e = load("encrypted.pdf");
    const p = await probeEncryption(e);
    expect(p.algo).toBe("RC4-128");
    expect(p.ownerOnly).toBe(false);
    expect((await decryptPdf(e, "test1234"))?.bytes.length).toBeGreaterThan(0);
    expect(await decryptPdf(e, "wrong")).toBeNull();
  });
});
