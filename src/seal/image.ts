// Seal image prep: load, trim blank margins, rotate on expanded transparent canvas, slice.
// Browser-only (uses canvas). Returns raw RGBA buffers for the PDF generator.

// [x0, x1) pixel column range of one vertical part
export type Boundary = [number, number];

export interface TrimResult {
  canvas: HTMLCanvasElement;
  trimmed: { top: number; left: number; bottom: number; right: number };
  origW: number;
  origH: number;
}

// deflated RGB samples + optional deflated alpha mask, ready to embed as an image XObject
export interface PdfImage { w: number; h: number; rgb: Uint8Array; mask: Uint8Array | null }

export type DeflateFn = (data: Uint8Array) => Promise<Uint8Array>;

export async function loadSealCanvas(file: ImageBitmapSource): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  bmp.close();
  return c;
}

function canvasPixels(c: HTMLCanvasElement): ImageData {
  return c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
}

export function trimBlankMargins(src: HTMLCanvasElement): TrimResult {
  const img = canvasPixels(src);
  const { width: W, height: H, data } = img;
  let anyTransparent = false;
  for (let i = 3; i < data.length; i += 4000 * 4) if (data[i] < 250) { anyTransparent = true; break; }
  const isBlank = (r: number, g: number, b: number, a: number) => (anyTransparent ? a <= 8 : r >= 246 && g >= 246 && b >= 246);
  const rowBlank = (y: number) => {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      if (!isBlank(data[o], data[o + 1], data[o + 2], data[o + 3])) return false;
    }
    return true;
  };
  const colBlank = (x: number) => {
    for (let y = 0; y < H; y++) {
      const o = (y * W + x) * 4;
      if (!isBlank(data[o], data[o + 1], data[o + 2], data[o + 3])) return false;
    }
    return true;
  };
  let top = 0, bottom = H - 1, left = 0, right = W - 1;
  while (top <= bottom && rowBlank(top)) top++;
  while (bottom > top && rowBlank(bottom)) bottom--;
  while (left <= right && colBlank(left)) left++;
  while (right > left && colBlank(right)) right--;
  if (top > bottom || left > right) throw new Error("圖片內容為空白");
  const w = right - left + 1, h = bottom - top + 1;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(src, left, top, w, h, 0, 0, w, h);
  return { canvas: c, trimmed: { top, left, bottom: H - 1 - bottom, right: W - 1 - right }, origW: W, origH: H };
}

export function rotateSeal(src: HTMLCanvasElement, angleDeg: number): HTMLCanvasElement {
  const rad = (angleDeg * Math.PI) / 180;
  const W = src.width, H = src.height;
  const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
  const w = Math.ceil(W * cos + H * sin), h = Math.ceil(W * sin + H * cos);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rad);
  ctx.drawImage(src, -W / 2, -H / 2);
  return c;
}

// exact 90° clockwise rotation (直蓋法 pre-rotation; no resampling blur beyond the turn)
export function rotateQuarter(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.height; c.height = src.width;
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

// split into vertical parts by pixel boundaries
export function splitVertical(src: HTMLCanvasElement, boundaries: Boundary[]): HTMLCanvasElement[] {
  // boundaries: array of [x0, x1)
  return boundaries.map(([x0, x1]) => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, x1 - x0); c.height = src.height;
    c.getContext("2d")!.drawImage(src, x0, 0, x1 - x0, src.height, 0, 0, x1 - x0, src.height);
    return c;
  });
}

export function halfBoundaries(W: number): Boundary[] {
  const mid = Math.ceil(W / 2);
  return [[0, mid], [mid, W]];
}

export function sliceBoundaries(W: number, n: number): Boundary[] {
  const out: Boundary[] = [];
  for (let i = 0; i < n; i++) out.push([Math.round((i * W) / n), Math.round(((i + 1) * W) / n)]);
  return out;
}

export function inkCoverage(canvas: HTMLCanvasElement): number {
  // fraction of pixels with visible ink (alpha-weighted)
  const img = canvasPixels(canvas);
  const d = img.data;
  let ink = 0;
  const total = img.width * img.height;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 24) ink++;
  return total ? ink / total : 0;
}

export async function canvasToPdfImage(canvas: HTMLCanvasElement, deflateFn: DeflateFn): Promise<PdfImage> {
  const img = canvasPixels(canvas);
  const { width, height, data } = img;
  const rgb = new Uint8Array(width * height * 3);
  const alpha = new Uint8Array(width * height);
  let hasAlpha = false;
  // Canvas rows are top-to-bottom; PDF image samples are also written top-to-bottom.
  // The CTM normalization in generate.ts handles coordinate orientation.
  for (let y = 0; y < height; y++) {
    const srcY = y;
    for (let x = 0; x < width; x++) {
      const src = (srcY * width + x) * 4;
      const dst = (y * width + x);
      const j = dst * 3;
      rgb[j] = data[src]; rgb[j + 1] = data[src + 1]; rgb[j + 2] = data[src + 2];
      const a = data[src + 3];
      alpha[dst] = a;
      if (a < 255) hasAlpha = true;
    }
  }
  const out: PdfImage = { w: width, h: height, rgb: await deflateFn(rgb), mask: null };
  if (hasAlpha) out.mask = await deflateFn(alpha);
  return out;
}

// Convert a seal canvas to grayscale (Rec. 709 luma), preserving the alpha channel
// so transparent backgrounds stay transparent.
export function toGrayscale(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Fade the seal by scaling its alpha channel (pct 0-100). Returns a new canvas;
// the source is never mutated. 100 returns the source unchanged.
export function applyOpacity(src: HTMLCanvasElement, pct: number): HTMLCanvasElement {
  if (pct >= 100) return src;
  const c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data, k = Math.max(0, pct) / 100;
  for (let i = 3; i < d.length; i += 4) d[i] = Math.round(d[i] * k);
  ctx.putImageData(img, 0, 0);
  return c;
}

// Does the image carry any real transparency of its own? (sampled scan)
export function hasTransparency(src: HTMLCanvasElement): boolean {
  const d = canvasPixels(src).data;
  for (let i = 3; i < d.length; i += 4 * 61) if (d[i] < 250) return true;
  return false;
}

// 去背 for seals shot/scanned on white (JPG): a pixel whose darkest channel is still
// near-white was background, so it goes transparent. A short ramp just below the cutoff
// keeps anti-aliased ink edges from turning into a hard white fringe.
export function whiteToAlpha(src: HTMLCanvasElement, cutoff = 246): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const m = Math.min(d[i], d[i + 1], d[i + 2]);
    if (m >= cutoff) d[i + 3] = 0;
    else if (m >= cutoff - 14) d[i + 3] = Math.min(d[i + 3], Math.round(((cutoff - m) / 14) * 255));
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
