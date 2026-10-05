// Post-processing: rebuild a PDF as a fresh compact file (incremental update
// history and dead objects dropped), optionally converting document colors to
// grayscale and re-encoding embedded JPEG images at a chosen quality.
// The uploaded original is never modified; the seal overlay is appended to
// the rebuilt base afterwards. Known limits: shading gradients, pattern fills
// and annotation appearances keep their colors; CMYK/JPEG2000 images are
// left untouched.
import { PdfDoc, PdfError, deflate, raw, serializeToBytes, strBytes } from "./pdf.js";

const lat1 = (bytes) => { let s = ""; const CH = 0x8000; for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH)); return s; };
const fromLat1 = (s) => { const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 255; return out; };

const rgbGray = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const cmykGray = (c, m, y, k) =>
  rgbGray(1 - Math.min(1, c + k), 1 - Math.min(1, m + k), 1 - Math.min(1, y + k));
const fmtG = (v) => String(parseFloat(Math.max(0, Math.min(1, v)).toFixed(4)));
const isNumTok = (t) => /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(t);

// ---------- content-stream color rewrite ----------
// Scans operator by operator; RGB/CMYK color settings become grayscale.
// Text, geometry and everything else pass through byte-identical.
export function grayContent(src) {
  const WS = new Set([0, 9, 10, 12, 13, 32]);
  const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);
  const n = src.length;
  let i = 0;
  const out = [];
  let buf = [];
  const flush = (op) => {
    let r = null;
    if ((op === "rg" || op === "RG") && buf.length === 3 && buf.every(isNumTok)) {
      r = fmtG(rgbGray(+buf[0], +buf[1], +buf[2])) + (op === "rg" ? " g" : " G");
    } else if ((op === "k" || op === "K") && buf.length === 4 && buf.every(isNumTok)) {
      r = fmtG(cmykGray(+buf[0], +buf[1], +buf[2], +buf[3])) + (op === "k" ? " g" : " G");
    } else if ((op === "sc" || op === "SC" || op === "scn" || op === "SCN") && buf.length > 0 && buf.every(isNumTok)) {
      if (buf.length === 3) r = fmtG(rgbGray(+buf[0], +buf[1], +buf[2])) + " " + op;
      else if (buf.length === 4) r = fmtG(cmykGray(+buf[0], +buf[1], +buf[2], +buf[3])) + " " + op;
    } else if ((op === "cs" || op === "CS") && buf.length === 1) {
      if (buf[0] === "/DeviceRGB" || buf[0] === "/DeviceCMYK") r = "/DeviceGray " + op;
    }
    if (r !== null) out.push(r);
    else { if (buf.length) out.push(buf.join(" ")); out.push(op); }
    buf = [];
  };
  while (i < n) {
    const c = src.charCodeAt(i);
    if (WS.has(c)) { i++; continue; }
    if (c === 37) { // % comment
      while (i < n && src.charCodeAt(i) !== 10 && src.charCodeAt(i) !== 13) i++;
      continue;
    }
    if (c === 40) { // ( literal string
      const start = i; let depth = 0;
      while (i < n) {
        const ch = src.charCodeAt(i);
        if (ch === 92) { i += 2; continue; }
        if (ch === 40) depth++;
        else if (ch === 41) { depth--; if (!depth) { i++; break; } }
        i++;
      }
      buf.push(src.slice(start, i)); continue;
    }
    if (c === 60) { // < hex string / << dict
      const start = i;
      if (src.charCodeAt(i + 1) === 60) { buf.push("<<"); i += 2; continue; }
      i++;
      while (i < n && src.charCodeAt(i) !== 62) i++;
      i++;
      buf.push(src.slice(start, i)); continue;
    }
    if (c === 62) { buf.push(src.charCodeAt(i + 1) === 62 ? ">>" : ">"); i += src.charCodeAt(i + 1) === 62 ? 2 : 1; continue; }
    if (c === 91) { // [ balanced array (string-aware)
      const start = i; let depth = 0;
      while (i < n) {
        const ch = src.charCodeAt(i);
        if (ch === 40) {
          let d2 = 0; i++;
          while (i < n) {
            const c2 = src.charCodeAt(i);
            if (c2 === 92) { i += 2; continue; }
            if (c2 === 40) d2++;
            else if (c2 === 41) { d2--; if (!d2) { i++; break; } }
            i++;
          }
          continue;
        }
        if (ch === 91) depth++;
        else if (ch === 93) { depth--; if (!depth) { i++; break; } }
        i++;
      }
      buf.push(src.slice(start, i)); continue;
    }
    if (c === 93 || c === 123 || c === 125) { flush(src[i]); i++; continue; }
    if (c === 47) { // /name
      const start = i; i++;
      while (i < n && !WS.has(src.charCodeAt(i)) && !DELIM.has(src.charCodeAt(i))) i++;
      buf.push(src.slice(start, i)); continue;
    }
    const start = i;
    while (i < n && !WS.has(src.charCodeAt(i)) && !DELIM.has(src.charCodeAt(i))) i++;
    const w = src.slice(start, i);
    if (isNumTok(w) || w === "true" || w === "false" || w === "null") { buf.push(w); continue; }
    if (w === "ID") { // inline image: copy data verbatim until ws + EI + delimiter
      if (buf.length) { out.push(buf.join(" ")); buf = []; }
      out.push("ID");
      i++; // exactly one whitespace byte follows ID
      const dStart = i;
      let end = -1;
      for (let j = i; j < n; j++) {
        if (src.charCodeAt(j) === 69 && j > 0 && WS.has(src.charCodeAt(j - 1)) && src.charCodeAt(j + 1) === 73) {
          const after = src.charCodeAt(j + 2);
          if (j + 2 >= n || WS.has(after) || DELIM.has(after)) { end = j; break; }
        }
      }
      if (end < 0) end = n;
      out.push(src.slice(dStart, end));
      i = end;
      continue;
    }
    flush(w);
  }
  if (buf.length) out.push(buf.join(" "));
  return out.join(" ");
}

// ---------- image transform ----------
// Returns a replacement stream object, or null to keep the original.
async function processImageValue(doc, value, { grayscale, jpegQuality, jpegScale = 1 }) {
  const dict = value.dict;
  if (dict["/ImageMask"] === true) return null;
  const bpc = dict["/BitsPerComponent"] ?? 8;
  if (bpc !== 8) return null;
  const w = dict["/Width"], h = dict["/Height"];
  if (!w || !h || w > 16000 || h > 16000 || w * h > 40000000) return null;
  if (dict["/Decode"]) return null; // non-default sample mapping: leave alone
  let filter = dict["/Filter"];
  if (Array.isArray(filter)) { if (filter.length !== 1) return null; filter = filter[0]; }
  let cs;
  try { cs = await doc.resolve(dict["/ColorSpace"]); } catch { return null; }
  let kind = null, indexed = null;
  if (cs === "/DeviceGray") kind = "gray";
  else if (cs === "/DeviceRGB") kind = "rgb";
  else if (cs === "/DeviceCMYK") kind = "cmyk";
  else if (Array.isArray(cs) && cs[0] === "/Indexed") {
    let base = null;
    try { base = await doc.resolve(cs[1]); } catch { /* ignore */ }
    if (base === "/DeviceRGB" || base === "/DeviceGray") { kind = "indexed"; indexed = { base, hival: cs[2], lookup: cs[3] }; }
  } else if (Array.isArray(cs) && cs[0] === "/ICCBased") {
    let icc = null;
    try { icc = await doc.resolve(cs[1]); } catch { /* ignore */ }
    const nn = icc && icc.$stream ? icc.dict["/N"] : icc?.["/N"];
    if (nn === 1) kind = "gray"; else if (nn === 3) kind = "rgb"; else if (nn === 4) kind = "cmyk";
  }
  if (!kind) return null;

  if (filter === "/DCTDecode") {
    // JPEG: re-encode through the browser (gray via canvas, quality = 壓縮率)
    if (kind !== "rgb" && kind !== "gray") return null;
    const wantGray = grayscale && kind === "rgb";
    if (!wantGray && jpegQuality == null) return null;
    let bmp;
    try { bmp = await createImageBitmap(new Blob([value.data], { type: "image/jpeg" })); }
    catch { return null; }
    // jpegScale < 1 downsamples the pixels (目標大小壓縮); placement is set by the page CTM,
    // so the image still fills the same area on the page
    const sc = jpegScale > 0 && jpegScale < 1 ? jpegScale : 1;
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(bmp.width * sc)); cv.height = Math.max(1, Math.round(bmp.height * sc));
    const cx = cv.getContext("2d");
    cx.imageSmoothingQuality = "high";
    cx.drawImage(bmp, 0, 0, cv.width, cv.height);
    bmp.close?.();
    if (wantGray) {
      const im = cx.getImageData(0, 0, cv.width, cv.height);
      const d = im.data;
      for (let p = 0; p < d.length; p += 4) {
        const y = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
        d[p] = d[p + 1] = d[p + 2] = y;
      }
      cx.putImageData(im, 0, 0);
    }
    const q = jpegQuality != null ? Math.max(0.1, Math.min(1, jpegQuality)) : 0.92;
    const blob = await new Promise((res) => cv.toBlob(res, "image/jpeg", q));
    if (!blob) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!wantGray && bytes.length >= value.data.length) return null; // never bloat
    const nd = { ...dict, "/Filter": "/DCTDecode", "/ColorSpace": "/DeviceRGB", "/Length": bytes.length, "/Width": cv.width, "/Height": cv.height };
    delete nd["/DecodeParms"];
    return { $stream: true, dict: nd, data: bytes, _jpg: true };
  }

  if (filter !== undefined && filter !== "/FlateDecode") return null;
  if (!grayscale) return null; // compress-only: flate pixels gain nothing from a re-zip
  let px;
  try { px = await doc.decodeStream(value); } catch { return null; }

  if (kind === "indexed") {
    if (indexed.base !== "/DeviceRGB") return null;
    let pal = null;
    const lk = indexed.lookup;
    try {
      if (lk && lk.$raw) {
        const b = lk.$raw instanceof Uint8Array ? lk.$raw : strBytes(lk.$raw);
        if (b[0] === 60) { // hex string <...>
          const hexs = lat1(b.slice(1, b.length - 1)).replace(/[^0-9A-Fa-f]/g, "");
          pal = new Uint8Array(Math.floor(hexs.length / 2));
          for (let k = 0; k < pal.length; k++) pal[k] = parseInt(hexs.substr(k * 2, 2), 16);
        } else if (b[0] === 40) { // literal string (...) with escapes
          const inner = b.slice(1, b.length - 1);
          const tmp = [];
          for (let k = 0; k < inner.length; k++) {
            if (inner[k] === 92 && k + 1 < inner.length) {
              const nc = inner[k + 1];
              if (nc >= 48 && nc <= 55) { // octal \ddd
                let oct = "", kk = k + 1;
                while (kk < inner.length && oct.length < 3 && inner[kk] >= 48 && inner[kk] <= 55) oct += String.fromCharCode(inner[kk++]);
                tmp.push(parseInt(oct, 8) & 255); k = kk - 1;
              } else {
                const map = { 110: 10, 114: 13, 116: 9, 98: 8, 102: 12 };
                tmp.push(map[nc] !== undefined ? map[nc] : nc); k++;
              }
            } else tmp.push(inner[k]);
          }
          pal = new Uint8Array(tmp);
        }
      } else if (lk && lk.$ref !== undefined) {
        const s = await doc.resolve(lk);
        if (s && s.$stream) pal = await doc.decodeStream(s);
      }
    } catch { return null; }
    if (!pal || pal.length % 3 !== 0) return null;
    const gp = new Uint8Array(pal.length / 3);
    for (let k = 0; k < gp.length; k++) gp[k] = Math.round(rgbGray(pal[k * 3], pal[k * 3 + 1], pal[k * 3 + 2]));
    let hex = "";
    for (let k = 0; k < gp.length; k++) hex += gp[k].toString(16).padStart(2, "0");
    if (px.length !== w * h) return null;
    const packed = await deflate(px);
    const nd = {
      ...dict,
      "/Filter": "/FlateDecode",
      "/ColorSpace": ["/Indexed", "/DeviceGray", indexed.hival, raw(strBytes("<" + hex + ">"))],
      "/Length": packed.length,
    };
    delete nd["/DecodeParms"];
    return { $stream: true, dict: nd, data: packed };
  }

  const comps = kind === "rgb" ? 3 : kind === "cmyk" ? 4 : 1;
  if (kind === "gray") return null; // already gray
  if (px.length !== w * h * comps) return null; // unexpected layout: stay safe
  const out = new Uint8Array(w * h);
  for (let p = 0, q = 0; q < out.length; p += comps, q++) {
    if (comps === 3) out[q] = Math.round(rgbGray(px[p], px[p + 1], px[p + 2]));
    else out[q] = Math.round(cmykGray(px[p] / 255, px[p + 1] / 255, px[p + 2] / 255, px[p + 3] / 255));
  }
  const packed = await deflate(out);
  const nd = { ...dict, "/Filter": "/FlateDecode", "/ColorSpace": "/DeviceGray", "/Length": packed.length };
  delete nd["/DecodeParms"];
  delete nd["/Mask"]; // color-key masks reference the old color space
  return { $stream: true, dict: nd, data: packed };
}

// ---------- full rewrite writer ----------
function writeFresh(doc, objs) {
  const chunks = [];
  const push = (c) => chunks.push(c);
  let pos = 0;
  const track = (c) => { push(c); pos += c.length; };
  track(strBytes("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n"));
  const offsets = new Map();
  for (const o of objs) {
    offsets.set(o.num, pos);
    track(strBytes(`${o.num} ${o.gen} obj\n`));
    track(serializeToBytes(o.value));
    track(strBytes("\nendobj\n"));
  }
  const xrefPos = pos;
  const runs = [];
  for (const o of objs) {
    const last = runs[runs.length - 1];
    if (last && o.num === last.start + last.items.length) last.items.push(o);
    else runs.push({ start: o.num, items: [o] });
  }
  let s = "xref\n";
  for (const r of runs) {
    s += `${r.start} ${r.items.length}\n`;
    for (const o of r.items) {
      s += String(offsets.get(o.num)).padStart(10, "0") + " " + String(o.gen).padStart(5, "0") + " n\r\n";
    }
  }
  s += "trailer\n";
  track(strBytes(s));
  const maxNum = objs.length ? objs[objs.length - 1].num : 0;
  const trailer = { "/Size": maxNum + 1, "/Root": doc.trailer["/Root"] };
  if (doc.trailer["/Info"]) trailer["/Info"] = doc.trailer["/Info"];
  track(serializeToBytes(trailer));
  track(strBytes(`\nstartxref\n${xrefPos}\n%%EOF\n`));
  let total = 0;
  for (const c of chunks) total += c.length;
  const outBytes = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { outBytes.set(c, off); off += c.length; }
  return outBytes;
}

export async function postprocessPdf(bytes, { grayscale = false, jpegQuality = null, jpegScale = 1, onProgress } = {}) {
  const doc = await PdfDoc.load(bytes);
  const pages = await doc.getPageRefs();
  // collect page content-stream refs
  const contentRefs = new Set();
  const addContents = async (c) => {
    if (!c) return;
    if (c.$ref !== undefined) {
      let r = null;
      try { r = await doc.resolve(c); } catch { return; }
      if (r && r.$stream) { contentRefs.add(c.$ref); return; }
      if (Array.isArray(r)) { for (const e of r) await addContents(e); }
      return;
    }
    if (Array.isArray(c)) { for (const e of c) await addContents(e); }
  };
  for (const p of pages) await addContents(p.dict["/Contents"]);

  const entries = [...doc.xref.entries()]
    .filter(([, e]) => e.type === 1 || e.type === 2)
    .sort((a, b) => a[0] - b[0]);
  const objs = [];
  const stats = { contents: 0, images: 0, jpegs: 0, dropped: 0 };
  let done = 0;
  for (const [num, entry] of entries) {
    done++;
    if (onProgress && (done % 10 === 0 || done === entries.length)) onProgress(done, entries.length);
    let value;
    try { value = await doc.getObject(num); } catch { stats.dropped++; continue; }
    if (value && typeof value === "object" && !Array.isArray(value) && !value.$raw && !value.$ref) {
      if (value.$stream) {
        const t = value.dict["/Type"];
        if (t === "/XRef" || t === "/ObjStm") { stats.dropped++; continue; }
        if (value.dict["/Subtype"] === "/Image") {
          if (grayscale || jpegQuality != null) {
            let nv = null;
            try { nv = await processImageValue(doc, value, { grayscale, jpegQuality, jpegScale }); } catch { nv = null; }
            if (nv) { value = nv; stats.images++; if (nv._jpg) stats.jpegs++; }
          }
        } else if (grayscale && (contentRefs.has(num) || value.dict["/Subtype"] === "/Form")) {
          let f = value.dict["/Filter"];
          if (Array.isArray(f)) f = f.length === 1 ? f[0] : "multi";
          if (f === undefined || f === "/FlateDecode") {
            try {
              const decoded = await doc.decodeStream(value);
              const rewritten = grayContent(lat1(decoded));
              const packed = await deflate(fromLat1(rewritten));
              const nd = { ...value.dict, "/Filter": "/FlateDecode", "/Length": packed.length };
              delete nd["/DecodeParms"];
              value = { $stream: true, dict: nd, data: packed };
              stats.contents++;
            } catch { /* keep original stream */ }
          }
        }
      } else if (value["/Linearized"] !== undefined) { stats.dropped++; continue; }
    }
    objs.push({ num, gen: entry.gen || 0, value });
  }
  const outBytes = writeFresh(doc, objs);
  return { bytes: outBytes, stats };
}
