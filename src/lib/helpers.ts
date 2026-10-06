import { hasTransparency, trimBlankMargins, whiteToAlpha } from "../seal/image.js";
import { type SizeUnit, type WmColor } from "../studio/stateTypes";
import { TARGET_RANGE, WM_COLORS } from "./constants";

export const clampRot = (v: unknown, fallback: number): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(-45, Math.min(45, n));
};

export const clampNum = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
};

export const clampTarget = (v: unknown, unit: SizeUnit): number => { const [lo, hi, d] = TARGET_RANGE[unit] || TARGET_RANGE.MB; return clampNum(v, lo, hi, d); };

export const fmtTarget = (v: unknown, unit: SizeUnit): string => `${clampTarget(v, unit)} ${unit}`;

export function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const fmtBytes = (n: number): string => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");

// Shared seal pipeline: trim blank margins → downscale for speed → 去背 (a flat white
// background becomes transparent when the image carries no alpha of its own, e.g. JPG),
// so every place the seal shows — thumbnail, method cards, preview halves, the PDF itself —
// renders the background-removed image.
export function prepSealCanvas(raw: HTMLCanvasElement) {
  const trimmed = trimBlankMargins(raw);
  let canvas = trimmed.canvas;
  let downscaled = false;
  const MAXDIM = 640;
  if (canvas.width > MAXDIM || canvas.height > MAXDIM) {
    const k = MAXDIM / Math.max(canvas.width, canvas.height);
    const c = document.createElement("canvas");
    c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
    c.getContext("2d")!.drawImage(canvas, 0, 0, c.width, c.height);
    canvas = c; downscaled = true;
  }
  let bgRemoved = false;
  if (!hasTransparency(canvas)) { canvas = whiteToAlpha(canvas); bgRemoved = true; }
  return { canvas, trimmed, downscaled, bgRemoved };
}

// error text for log/UI lines: Error.message, or the thrown value itself
export const errText = (e: unknown): string => (e as { message?: string } | null)?.message || String(e);

// strip characters no filesystem wants, and trailing/leading dots/spaces
export const sanitizeBase = (s: string | null | undefined): string => (s || "").replace(/[\\/:*?"<>|\x00-\u001F]/g, "").replace(/^[\s.]+|[\s.]+$/g, "");

// Legacy-encoded filenames (Big5/GBK/UTF-8 bytes misread as Latin-1) surface as mojibake.
// Re-encode the string back to bytes and try decoders: a clean UTF-8 decode with real CJK
// wins outright (modern systems; its GBK misread would score more glyphs but is wrong),
// otherwise the legacy CJK decode with the best score: CJK glyphs earn, replacement
// chars pay (a truncated byte pair right before ".pdf" must not sink a good decode).
export function repairMojibake(name: string): string {
  if (!name) return name;
  name = name.normalize("NFC"); // macOS NFD decomposes accented mojibake into base + combining marks (> 0xFF) — compose first
  let suspect = 0;
  for (const ch of name) {
    const c = ch.codePointAt(0)!;
    if (c > 0xff) return name; // already real Unicode (e.g. CJK) — nothing to repair
    if (c >= 0x80) suspect++;
  }
  if (suspect < 2) return name; // plain ASCII: fine already
  const bytes = new Uint8Array([...name].map((ch) => ch.charCodeAt(0)));
  const score = (t: string) => {
    let cjk = 0, bad = 0;
    for (const ch of t) { const c = ch.codePointAt(0)!; if (c >= 0x3400 && c <= 0x9fff) cjk++; else if (c === 0xfffd) bad++; }
    return cjk * 2 - bad * 5;
  };
  try {
    const t = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (!t.includes("�") && score(t) >= 4) return t; // clean UTF-8 with 2+ CJK glyphs
  } catch { /* decoder unavailable */ }
  let best: string | null = null, bestScore = 3; // threshold: 2 clean CJK glyphs, so "résumé.pdf" stays put
  for (const enc of ["big5", "gb18030"]) {
    try {
      const t = new TextDecoder(enc, { fatal: false }).decode(bytes);
      const sc = score(t);
      if (sc > bestScore) { best = t; bestScore = sc; }
    } catch { /* decoder unavailable in this browser */ }
  }
  if (best) return best.replace(/�+$/g, ""); // drop a dangling truncated pair at the tail
  return name; // no confident repair: keep the original string
}

// The imprint the 玉璽 leaves behind: no characters — a random mandala 圖騰 drawn fresh on
// every stamping (concentric rings of petals, a dot ring, and a solid core).
export function randomMandala() {
  let s = (Math.random() * 0x7fffffff) | 0 || 42;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const C = 48, el = [];
  el.push(`<circle cx='${C}' cy='${C}' r='45' fill='none' stroke-width='3.5'/>`);
  el.push(`<circle cx='${C}' cy='${C}' r='39.5' fill='none' stroke-width='1.2'/>`);
  let rOut = 36;
  const rings = 2 + Math.floor(rnd() * 2); // 2–3 petal rings
  for (let ring = 0; ring < rings; ring++) {
    const petals = 6 + Math.floor(rnd() * 7); // 6–12 petals
    const len = Math.min(rOut * (0.42 + rnd() * 0.16), rOut - 4);
    const wid = Math.max(2.2, len * (0.3 + rnd() * 0.22));
    const off = rnd() * 360;
    for (let i = 0; i < petals; i++) {
      el.push(`<ellipse cx='${C}' cy='${C - rOut + len / 2}' rx='${wid.toFixed(1)}' ry='${(len / 2).toFixed(1)}' fill='none' stroke-width='1.5' transform='rotate(${(off + (360 / petals) * i).toFixed(1)} ${C} ${C})'/>`);
    }
    rOut -= len * 0.92;
  }
  if (rOut > 8) {
    const dots = 5 + Math.floor(rnd() * 4);
    const rr = Math.max(3, rOut - 2.5);
    for (let i = 0; i < dots; i++) {
      const a = (2 * Math.PI * i) / dots;
      el.push(`<circle cx='${(C + Math.cos(a) * rr).toFixed(1)}' cy='${(C + Math.sin(a) * rr).toFixed(1)}' r='1.7'/>`);
    }
  }
  el.push(`<circle cx='${C}' cy='${C}' r='${(2.5 + rnd() * 2.5).toFixed(1)}'/>`);
  return "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96' fill='#FBEFE2' stroke='#FBEFE2'>${el.join("")}</svg>`);
}

export function buildWatermarkCanvas({ text, sizePt, opacityPct, angleDeg, color, tile, pageWpt, pageHpt }: { text: string; sizePt: number; opacityPct: number; angleDeg: number; color: WmColor; tile: boolean; pageWpt: number; pageHpt: number }) {
  const SCALE = 2; // px per pt
  const w = Math.max(2, Math.round(pageWpt * SCALE));
  const h = Math.max(2, Math.round(pageHpt * SCALE));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  const [r, g, b] = WM_COLORS[color] || WM_COLORS.grey;
  ctx.translate(w / 2, h / 2);
  ctx.rotate((angleDeg * Math.PI) / 180);
  const px = Math.max(8, sizePt * SCALE);
  ctx.font = `700 ${px}px "Noto Sans TC", "Noto Serif TC", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = `rgba(${r},${g},${b},${opacityPct / 100})`;
  if (tile) {
    const tw = Math.max(ctx.measureText(text).width, px);
    const stepX = tw + px * 1.4;
    const stepY = px * 3.0;
    const R = Math.hypot(w, h) / 2 + stepX;
    let row = 0;
    for (let y = -R; y <= R; y += stepY, row++) {
      const off = (row % 2) * (stepX / 2);
      for (let x = -R; x <= R; x += stepX) ctx.fillText(text, x + off, y);
    }
  } else {
    ctx.fillText(text, 0, 0);
  }
  return c;
}
