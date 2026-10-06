// Mini page rasterizer: real page thumbnails for the 配置預覽 diagram.
// Replays page content streams onto a canvas: vector paths, colors (gray / RGB /
// CMYK / Indexed / Separation approximated), images (DCT + Flate, SMask, image
// masks, inline images) and nested Form XObjects. Text is drawn as positioned
// bars — real glyph outlines would need a full font engine, and at thumbnail
// scale a bar reads the same; invisible text (Tr 3) stays invisible.
// Anything unsupported is skipped per-operator; a page that fails outright
// returns null and the diagram keeps its placeholder card.

const lat1 = (bytes) => { let s = ""; const CH = 0x8000; for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH)); return s; };

// ---------- content-stream tokenizer ----------
// Flat op list: [{ op, args:[tok...] }]; tok = {n} | {name:"/Foo"} | {str:Uint8Array} | {arr:[tok]} | {img:{dict,data}} | true | false | null
const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);
const NUM_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

function readLiteralString(src, i) {
  const n = src.length;
  i++;
  const out = [];
  let depth = 1;
  while (i < n && depth > 0) {
    const ch = src[i];
    if (ch === 92) {
      const nc = src[i + 1];
      if (nc === undefined) { i++; break; }
      if (nc === 110) { out.push(10); i += 2; }
      else if (nc === 114) { out.push(13); i += 2; }
      else if (nc === 116) { out.push(9); i += 2; }
      else if (nc === 98) { out.push(8); i += 2; }
      else if (nc === 102) { out.push(12); i += 2; }
      else if (nc === 40 || nc === 41 || nc === 92) { out.push(nc); i += 2; }
      else if (nc >= 48 && nc <= 55) {
        let oct = "", k = i + 1;
        while (k < n && oct.length < 3 && src[k] >= 48 && src[k] <= 55) oct += String.fromCharCode(src[k++]);
        out.push(parseInt(oct, 8) & 255); i = k;
      } else if (nc === 10 || nc === 13) { i += 2; if (nc === 13 && src[i] === 10) i++; }
      else { out.push(nc); i += 2; }
    } else if (ch === 40) { depth++; out.push(ch); i++; }
    else if (ch === 41) { depth--; if (depth > 0) out.push(ch); i++; }
    else { out.push(ch); i++; }
  }
  return { bytes: new Uint8Array(out), next: i };
}

function readHexString(src, i) {
  const n = src.length;
  i++;
  let hex = "";
  while (i < n && src[i] !== 62) { if (!WS.has(src[i])) hex += String.fromCharCode(src[i]); i++; }
  i++;
  if (hex.length % 2) hex += "0";
  const out = new Uint8Array(hex.length / 2);
  for (let k = 0; k < out.length; k++) out[k] = parseInt(hex.substr(k * 2, 2), 16);
  return { bytes: out, next: i };
}

const II_KEY = { "/W": "/Width", "/H": "/Height", "/BPC": "/BitsPerComponent", "/CS": "/ColorSpace", "/F": "/Filter", "/DP": "/DecodeParms", "/IM": "/ImageMask", "/D": "/Decode" };
const II_FILTER = { "/Fl": "/FlateDecode", "/AHx": "/ASCIIHexDecode", "/A85": "/ASCII85Decode", "/LZW": "/LZWDecode", "/CCF": "/CCITTFaxDecode", "/DCT": "/DCTDecode", "/JPX": "/JPXDecode", "/JBIG2": "/JBIG2Decode", "/RL": "/RunLengthDecode" };
const II_CS = { "/G": "/DeviceGray", "/RGB": "/DeviceRGB", "/CMYK": "/DeviceCMYK", "/I": "/Indexed" };

function tokenize(src) {
  const n = src.length;
  const ops = [];
  let stack = [];
  let i = 0;
  const readWord = () => {
    const st = i;
    while (i < n && !WS.has(src[i]) && !DELIM.has(src[i])) i++;
    return lat1(src.subarray(st, i));
  };
  const skipWs = () => { while (i < n && WS.has(src[i])) i++; };
  const readIIValue = () => {
    skipWs();
    const c = src[i];
    if (c === 47) { i++; return { name: "/" + readWord() }; }
    if (c === 91) {
      i++;
      const a = [];
      for (;;) { skipWs(); if (src[i] === 93) { i++; return { arr: a }; } a.push(readIIValue()); }
    }
    const w = readWord();
    if (NUM_RE.test(w)) return { n: parseFloat(w) };
    if (w === "true") return true;
    if (w === "false") return false;
    return null;
  };
  while (i < n) {
    const c = src[i];
    if (WS.has(c)) { i++; continue; }
    if (c === 37) { while (i < n && src[i] !== 10 && src[i] !== 13) i++; continue; }
    if (c === 40) { const r = readLiteralString(src, i); stack.push({ str: r.bytes }); i = r.next; continue; }
    if (c === 60) {
      if (src[i + 1] === 60) { i += 2; continue; }
      const r = readHexString(src, i); stack.push({ str: r.bytes }); i = r.next; continue;
    }
    if (c === 62) { i += (src[i + 1] === 62) ? 2 : 1; continue; }
    if (c === 91) { stack.push("["); i++; continue; }
    if (c === 93) {
      const a = [];
      while (stack.length && stack[stack.length - 1] !== "[") a.unshift(stack.pop());
      if (stack.length) stack.pop();
      stack.push({ arr: a }); i++; continue;
    }
    if (c === 47) { i++; stack.push({ name: "/" + readWord() }); continue; }
    const w = readWord();
    if (!w) { i++; continue; }
    if (NUM_RE.test(w)) { stack.push({ n: parseFloat(w) }); continue; }
    if (w === "true") { stack.push(true); continue; }
    if (w === "false") { stack.push(false); continue; }
    if (w === "null") { stack.push(null); continue; }
    if (w === "BI") {
      const rawDict = {};
      for (;;) {
        skipWs();
        if (src[i] === 47) { i++; const k = "/" + readWord(); rawDict[k] = readIIValue(); }
        else { readWord(); break; } // consumes ID
      }
      i++; // exactly one whitespace byte follows ID
      const dStart = i;
      let end = -1;
      for (let j = i; j < n; j++) {
        if (src[j] === 69 && j > 0 && WS.has(src[j - 1]) && src[j + 1] === 73) {
          const after = src[j + 2];
          if (j + 2 >= n || WS.has(after) || DELIM.has(after)) { end = j; break; }
        }
      }
      if (end < 0) end = n;
      const nd = {};
      for (const k of Object.keys(rawDict)) {
        const nk = II_KEY[k] || k;
        let v = rawDict[k];
        if (nk === "/Filter" && v) {
          const mapF = (f) => (f && f.name ? { name: II_FILTER[f.name] || f.name } : f);
          v = v.arr ? v.arr.map(mapF) : mapF(v);
        }
        if (nk === "/ColorSpace" && v) {
          if (v.name && II_CS[v.name]) v = { name: II_CS[v.name] };
          else if (v.arr && v.arr[0] && v.arr[0].name && II_CS[v.arr[0].name]) v.arr[0] = { name: II_CS[v.arr[0].name] };
        }
        nd[nk] = v;
      }
      const flat = {};
      for (const k of Object.keys(nd)) {
        const v = nd[k];
        if (v && v.n !== undefined) flat[k] = v.n;
        else if (v && v.name) flat[k] = v.name;
        else if (v && v.arr) flat[k] = v.arr.map((x) => (x && x.n !== undefined ? x.n : x && x.name ? x.name : x));
        else flat[k] = v;
      }
      ops.push({ op: "__img__", args: [{ img: { dict: flat, data: src.slice(dStart, end) } }] });
      i = end + 2; // skip EI
      continue;
    }
    ops.push({ op: w, args: stack });
    stack = [];
  }
  return ops;
}

// ---------- color helpers ----------
const cmykToRgb = (c, m, y, k) => [
  255 * (1 - Math.min(1, c + k)),
  255 * (1 - Math.min(1, m + k)),
  255 * (1 - Math.min(1, y + k)),
];
const BLEND = {
  "/Normal": "source-over", "/Multiply": "multiply", "/Screen": "screen", "/Overlay": "overlay",
  "/Darken": "darken", "/Lighten": "lighten", "/ColorDodge": "color-dodge", "/ColorBurn": "color-burn",
  "/HardLight": "hard-light", "/SoftLight": "soft-light", "/Difference": "difference", "/Exclusion": "exclusion",
};

async function paletteBytes(doc, lk) {
  if (!lk) return null;
  if (lk.$raw) {
    const b = lk.$raw instanceof Uint8Array ? lk.$raw : new TextEncoder().encode(lk.$raw);
    if (b[0] === 60) {
      const hexs = lat1(b.slice(1, b.length - 1)).replace(/[^0-9A-Fa-f]/g, "");
      const pal = new Uint8Array(Math.floor(hexs.length / 2));
      for (let k = 0; k < pal.length; k++) pal[k] = parseInt(hexs.substr(k * 2, 2), 16);
      return pal;
    }
    if (b[0] === 40) return readLiteralString(b, 0).bytes;
    return null;
  }
  if (lk.$ref !== undefined) {
    const s = await doc.resolve(lk);
    if (s && s.$stream) return doc.decodeStream(s);
  }
  return null;
}

// /ColorSpace value (name, array, or resource-dict name) → { kind, comps, ... }
async function resolveCS(doc, res, cs) {
  cs = await doc.resolve(cs);
  if (typeof cs === "string") {
    if (cs === "/DeviceGray") return { kind: "gray", comps: 1 };
    if (cs === "/DeviceRGB") return { kind: "rgb", comps: 3 };
    if (cs === "/DeviceCMYK") return { kind: "cmyk", comps: 4 };
    if (cs === "/Pattern") return { kind: "pattern", comps: 0 };
    const named = res && res["/ColorSpace"] ? await doc.resolve(res["/ColorSpace"]) : null;
    if (named && named[cs] !== undefined) return resolveCS(doc, res, named[cs]);
    return { kind: "rgb", comps: 3 };
  }
  if (Array.isArray(cs) && cs.length) {
    const t = cs[0];
    if (t === "/CalGray") return { kind: "gray", comps: 1 };
    if (t === "/Lab") return { kind: "lab", comps: 3 };
    if (t === "/CalRGB") return { kind: "rgb", comps: 3 };
    if (t === "/ICCBased") {
      let icc = null;
      try { icc = await doc.resolve(cs[1]); } catch { /* ignore */ }
      const nn = icc && icc.$stream ? icc.dict["/N"] : icc && icc["/N"];
      if (nn === 1) return { kind: "gray", comps: 1 };
      if (nn === 4) return { kind: "cmyk", comps: 4 };
      return { kind: "rgb", comps: 3 };
    }
    if (t === "/Indexed") {
      const base = await resolveCS(doc, res, cs[1]);
      const pal = await paletteBytes(doc, cs[3]);
      return { kind: "indexed", comps: 1, base, pal };
    }
    if (t === "/Separation") return { kind: "separation", comps: 1 };
    if (t === "/DeviceN") return { kind: "separation", comps: Array.isArray(cs[1]) ? cs[1].length : 1 };
    if (t === "/Pattern") {
      if (cs.length > 1) { const base = await resolveCS(doc, res, cs[1]); return { kind: "pattern", comps: base.comps, base }; }
      return { kind: "pattern", comps: 0 };
    }
  }
  return { kind: "rgb", comps: 3 };
}

function compsToRgb(csInfo, comps) {
  if (!csInfo) return [0, 0, 0];
  switch (csInfo.kind) {
    case "gray": { const g = (comps[0] ?? 0) * 255; return [g, g, g]; }
    case "rgb": return [(comps[0] ?? 0) * 255, (comps[1] ?? 0) * 255, (comps[2] ?? 0) * 255];
    case "cmyk": return cmykToRgb(comps[0] ?? 0, comps[1] ?? 0, comps[2] ?? 0, comps[3] ?? 0);
    case "lab": { const L = comps[0] ?? 0; return [L * 2.55, L * 2.55, L * 2.55]; }
    case "separation": { const g = (1 - (comps[0] ?? 0)) * 255; return [g, g, g]; }
    case "indexed": {
      const idx = Math.round(comps[0] ?? 0);
      const b = csInfo.base;
      if (!csInfo.pal || !b) return [128, 128, 128];
      const off = idx * b.comps;
      if (off + b.comps > csInfo.pal.length) return [0, 0, 0];
      if (b.kind === "rgb") return [csInfo.pal[off], csInfo.pal[off + 1], csInfo.pal[off + 2]];
      if (b.kind === "gray") { const g = csInfo.pal[off]; return [g, g, g]; }
      if (b.kind === "cmyk") return cmykToRgb(csInfo.pal[off] / 255, csInfo.pal[off + 1] / 255, csInfo.pal[off + 2] / 255, csInfo.pal[off + 3] / 255);
      return [csInfo.pal[off], csInfo.pal[off], csInfo.pal[off]];
    }
    case "pattern": return csInfo.base ? compsToRgb(csInfo.base, comps) : [192, 192, 192];
    default: return [0, 0, 0];
  }
}
const css = ([r, g, b]) => `rgb(${Math.round(Math.max(0, Math.min(255, r)))},${Math.round(Math.max(0, Math.min(255, g)))},${Math.round(Math.max(0, Math.min(255, b)))})`;

// ---------- image decoding ----------
async function decodeImageToCanvas(doc, res, dict, rawData, cache, cacheKey) {
  if (cacheKey != null && cache.has(cacheKey)) return cache.get(cacheKey);
  const finish = (v) => { if (cacheKey != null) cache.set(cacheKey, v); return v; };
  const w = dict["/Width"], h = dict["/Height"];
  if (!w || !h || w > 8000 || h > 8000 || w * h > 24000000) return finish(null);
  const isMask = dict["/ImageMask"] === true;
  const bpc = dict["/BitsPerComponent"] ?? (isMask ? 1 : 8);
  let filter = dict["/Filter"];
  if (Array.isArray(filter)) { if (filter.length !== 1) return finish(null); filter = filter[0]; }
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const cx = cv.getContext("2d");

  if (filter === "/DCTDecode") {
    try {
      const bmp = await createImageBitmap(new Blob([rawData], { type: "image/jpeg" }));
      cx.drawImage(bmp, 0, 0);
      bmp.close?.();
    } catch { return finish(null); }
  } else if (filter === undefined || filter === "/FlateDecode") {
    let px;
    try { px = await doc.decodeStream({ dict, data: rawData }); } catch { return finish(null); }
    const img = cx.createImageData(w, h);
    const d = img.data;
    if (isMask) {
      // stencil mask: alpha only; the fill color is applied at paint time
      const rowBytes = Math.ceil(w / 8);
      if (px.length < rowBytes * h) return finish(null);
      const dec = dict["/Decode"];
      const inv = Array.isArray(dec) && dec[0] === 1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const bit = (px[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
          const on = inv ? 1 - bit : bit;
          d[(y * w + x) * 4 + 3] = on ? 255 : 0;
        }
      }
      cx.putImageData(img, 0, 0);
      cv._isStencil = true;
    } else {
      const csInfo = await resolveCS(doc, res, dict["/ColorSpace"] ?? "/DeviceRGB");
      const comps = csInfo.comps || 1;
      if (bpc === 8) {
        if (px.length < w * h * comps) return finish(null);
        for (let p = 0, q = 0; q < w * h; p += comps, q++) {
          let rgb;
          if (csInfo.kind === "gray" || csInfo.kind === "separation") rgb = [px[p], px[p], px[p]];
          else if (csInfo.kind === "cmyk") rgb = cmykToRgb(px[p] / 255, px[p + 1] / 255, px[p + 2] / 255, px[p + 3] / 255);
          else if (csInfo.kind === "indexed") rgb = compsToRgb(csInfo, [px[p]]);
          else rgb = [px[p], px[p + 1], px[p + 2]];
          const o = q * 4;
          d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255;
        }
      } else if (bpc === 1 || bpc === 2 || bpc === 4) {
        const perRow = Math.ceil((w * bpc) / 8);
        if (px.length < perRow * h) return finish(null);
        const maxV = (1 << bpc) - 1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const bitPos = x * bpc;
            const v = (px[y * perRow + (bitPos >> 3)] >> (8 - bpc - (bitPos & 7))) & maxV;
            const o = (y * w + x) * 4;
            let rgb;
            if (csInfo.kind === "indexed") rgb = compsToRgb(csInfo, [v]);
            else { const g = Math.round((v / maxV) * 255); rgb = [g, g, g]; }
            d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255;
          }
        }
      } else return finish(null);
      cx.putImageData(img, 0, 0);
    }
  } else {
    return finish(null); // JPX / JBIG2 / CCITT / LZW / multi-filter: skipped
  }

  if (dict["/SMask"] && !isMask) {
    try {
      const sm = await doc.resolve(dict["/SMask"]);
      if (sm && sm.$stream) {
        const smCv = await decodeImageToCanvas(doc, res, { ...sm.dict, "/SMask": undefined, "/Mask": undefined }, sm.data, new Map(), null);
        if (smCv) {
          const tmp = document.createElement("canvas");
          tmp.width = w; tmp.height = h;
          const tx = tmp.getContext("2d");
          tx.drawImage(smCv, 0, 0, w, h);
          const sd = tx.getImageData(0, 0, w, h).data;
          const main = cx.getImageData(0, 0, w, h);
          const md = main.data;
          for (let p = 0; p < md.length; p += 4) md[p + 3] = sd[p];
          cx.putImageData(main, 0, 0);
        }
      }
    } catch { /* keep opaque */ }
  }
  return finish(cv);
}

// ---------- renderer ----------
export function createRenderer(doc) {
  const imgCache = new Map();  // image object num → canvas | null
  const csCache = new Map();   // color-space name → resolved info
  const fontCache = new Map(); // font object num → { cid }

  const num = (t) => (t && t.n !== undefined ? t.n : typeof t === "number" ? t : 0);

  async function lookupFont(res, name) {
    const fonts = res["/Font"] ? await doc.resolve(res["/Font"]) : null;
    const f = fonts ? fonts[name] : null;
    if (!f) return { cid: false };
    const refNum = f.$ref !== undefined ? f.$ref : null;
    if (refNum != null && fontCache.has(refNum)) return fontCache.get(refNum);
    let out = { cid: false };
    try {
      const fd = await doc.resolve(f);
      if (fd && fd["/Subtype"] === "/Type0") out = { cid: true };
    } catch { /* keep default */ }
    if (refNum != null) fontCache.set(refNum, out);
    return out;
  }

  function paintImage(ctx, st, imgCv) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, st.fillA));
    ctx.transform(1, 0, 0, -1, 0, 1); // image row 0 = top of the unit square
    if (imgCv._isStencil) {
      const t = document.createElement("canvas");
      t.width = imgCv.width; t.height = imgCv.height;
      const tx = t.getContext("2d");
      tx.drawImage(imgCv, 0, 0);
      tx.globalCompositeOperation = "source-in";
      tx.fillStyle = css(st.fill);
      tx.fillRect(0, 0, t.width, t.height);
      ctx.drawImage(t, 0, 0, 1, 1);
    } else {
      ctx.drawImage(imgCv, 0, 0, 1, 1);
    }
    ctx.restore();
  }

  const pushState = (ctx, st) => {
    ctx.save();
    st.stack.push({ ...st, tm: [...st.tm], tlm: [...st.tlm], stack: st.stack });
  };
  const popState = (ctx, st) => {
    ctx.restore();
    const prev = st.stack.pop();
    if (prev) {
      const stackArr = prev.stack;
      Object.assign(st, prev);
      st.stack = stackArr;
    }
  };

  async function execOps(ops, res, ctx, st, depth) {
    let path = new Path2D();
    const setColor = async (isFill, compsTok) => {
      const csName = isFill ? st.fillCS : st.strokeCS;
      let info = typeof csName === "string" ? csCache.get(csName) : null;
      if (!info) {
        info = await resolveCS(doc, res, csName);
        if (typeof csName === "string") csCache.set(csName, info);
      }
      const rgb = compsToRgb(info, compsTok.map(num));
      if (isFill) st.fill = rgb; else st.stroke = rgb;
    };
    const advanceTm = (adv) => {
      const [a, b, c, dd, e, f] = st.tm;
      st.tm = [a, b, c, dd, e + adv * a, f + adv * b];
    };
    const newline = () => {
      const [a, b, c, dd, e, f] = st.tlm;
      st.tlm = [a, b, c, dd, e - st.leading * c, f - st.leading * dd];
      st.tm = [...st.tlm];
    };
    const showText = (bytes) => {
      // displacement = (wEm*fs + Tc (+Tw for spaces)) * hScale/100
      const cid = st.fontInfo.cid;
      const unit = cid ? 2 : 1;
      const wEm = cid ? 1.0 : 0.5;
      const fs = st.fontSize, hs = st.hScale / 100;
      let adv = 0;
      const nGlyphs = Math.floor(bytes.length / unit);
      for (let k = 0; k < nGlyphs; k++) {
        const isSpace = !cid && bytes[k] === 32;
        adv += wEm * fs + st.charSpace + (isSpace ? st.wordSpace : 0);
      }
      adv *= hs;
      if (st.render !== 3 && fs > 0 && adv > 0) {
        ctx.save();
        ctx.transform(st.tm[0], st.tm[1], st.tm[2], st.tm[3], st.tm[4], st.tm[5]);
        ctx.transform(fs * hs, 0, 0, fs, 0, st.rise);
        ctx.globalAlpha = Math.max(0, Math.min(1, st.fillA)) * 0.62;
        ctx.fillStyle = css(st.fill);
        ctx.fillRect(0, -0.2, Math.max(adv / (fs * hs), 0.1), 0.8);
        ctx.restore();
      }
      advanceTm(adv);
    };

    for (const { op, args } of ops) {
      try {
        switch (op) {
          case "m": path.moveTo(num(args[0]), num(args[1])); st.curX = num(args[0]); st.curY = num(args[1]); break;
          case "l": path.lineTo(num(args[0]), num(args[1])); st.curX = num(args[0]); st.curY = num(args[1]); break;
          case "c":
            path.bezierCurveTo(num(args[0]), num(args[1]), num(args[2]), num(args[3]), num(args[4]), num(args[5]));
            st.curX = num(args[4]); st.curY = num(args[5]); break;
          case "v":
            path.bezierCurveTo(st.curX, st.curY, num(args[0]), num(args[1]), num(args[2]), num(args[3]));
            st.curX = num(args[2]); st.curY = num(args[3]); break;
          case "y":
            path.bezierCurveTo(num(args[0]), num(args[1]), num(args[2]), num(args[3]), num(args[2]), num(args[3]));
            st.curX = num(args[2]); st.curY = num(args[3]); break;
          case "h": path.closePath(); break;
          case "re": path.rect(num(args[0]), num(args[1]), num(args[2]), num(args[3])); st.curX = num(args[0]); st.curY = num(args[1]); break;
          case "S": case "s": {
            if (op === "s") path.closePath();
            ctx.globalAlpha = Math.max(0, Math.min(1, st.strokeA));
            ctx.strokeStyle = css(st.stroke);
            ctx.stroke(path); path = new Path2D(); break;
          }
          case "f": case "F": case "f*": {
            ctx.globalAlpha = Math.max(0, Math.min(1, st.fillA));
            ctx.fillStyle = css(st.fill);
            ctx.fill(path, op === "f*" ? "evenodd" : "nonzero");
            path = new Path2D(); break;
          }
          case "B": case "B*": case "b": case "b*": {
            if (op === "b" || op === "b*") path.closePath();
            ctx.globalAlpha = Math.max(0, Math.min(1, st.fillA));
            ctx.fillStyle = css(st.fill);
            ctx.fill(path, op.endsWith("*") ? "evenodd" : "nonzero");
            ctx.globalAlpha = Math.max(0, Math.min(1, st.strokeA));
            ctx.strokeStyle = css(st.stroke);
            ctx.stroke(path);
            path = new Path2D(); break;
          }
          case "n": path = new Path2D(); break;
          case "W": ctx.clip(path, "nonzero"); break;
          case "W*": ctx.clip(path, "evenodd"); break;
          case "q": pushState(ctx, st); break;
          case "Q": popState(ctx, st); break;
          case "cm": ctx.transform(num(args[0]), num(args[1]), num(args[2]), num(args[3]), num(args[4]), num(args[5])); break;
          case "w": ctx.lineWidth = Math.max(num(args[0]), 0.01); break;
          case "J": ctx.lineCap = ["butt", "round", "square"][num(args[0])] || "butt"; break;
          case "j": ctx.lineJoin = ["miter", "round", "bevel"][num(args[0])] || "miter"; break;
          case "M": ctx.miterLimit = num(args[0]); break;
          case "d": {
            const arr = args[0] && args[0].arr ? args[0].arr.map(num) : [];
            ctx.setLineDash(arr);
            ctx.lineDashOffset = num(args[1]);
            break;
          }
          case "gs": {
            const table = res["/ExtGState"] ? await doc.resolve(res["/ExtGState"]) : null;
            const g = table && args[0] && args[0].name ? await doc.resolve(table[args[0].name]) : null;
            if (g) {
              if (typeof g["/ca"] === "number") st.fillA = g["/ca"];
              if (typeof g["/CA"] === "number") st.strokeA = g["/CA"];
              const bm = Array.isArray(g["/BM"]) ? g["/BM"][0] : g["/BM"];
              if (typeof bm === "string" && BLEND[bm]) ctx.globalCompositeOperation = BLEND[bm];
            }
            break;
          }
          case "g": st.fillCS = "/DeviceGray"; st.fill = [num(args[0]) * 255, num(args[0]) * 255, num(args[0]) * 255]; break;
          case "G": st.strokeCS = "/DeviceGray"; st.stroke = [num(args[0]) * 255, num(args[0]) * 255, num(args[0]) * 255]; break;
          case "rg": st.fillCS = "/DeviceRGB"; st.fill = [num(args[0]) * 255, num(args[1]) * 255, num(args[2]) * 255]; break;
          case "RG": st.strokeCS = "/DeviceRGB"; st.stroke = [num(args[0]) * 255, num(args[1]) * 255, num(args[2]) * 255]; break;
          case "k": st.fillCS = "/DeviceCMYK"; st.fill = cmykToRgb(num(args[0]), num(args[1]), num(args[2]), num(args[3])); break;
          case "K": st.strokeCS = "/DeviceCMYK"; st.stroke = cmykToRgb(num(args[0]), num(args[1]), num(args[2]), num(args[3])); break;
          case "cs": if (args[0] && args[0].name) { st.fillCS = args[0].name; st.fill = [0, 0, 0]; } break;
          case "CS": if (args[0] && args[0].name) { st.strokeCS = args[0].name; st.stroke = [0, 0, 0]; } break;
          case "sc": case "scn": await setColor(true, args.filter((a) => a && a.n !== undefined)); break;
          case "SC": case "SCN": await setColor(false, args.filter((a) => a && a.n !== undefined)); break;
          case "BT": st.tm = [1, 0, 0, 1, 0, 0]; st.tlm = [1, 0, 0, 1, 0, 0]; break;
          case "Tf": st.fontInfo = args[0] && args[0].name ? await lookupFont(res, args[0].name) : { cid: false }; st.fontSize = num(args[1]); break;
          case "Td": case "TD": {
            if (op === "TD") st.leading = -num(args[1]);
            const [a, b, c, dd, e, f] = st.tlm;
            const tx = num(args[0]), ty = num(args[1]);
            st.tlm = [a, b, c, dd, e + tx * a + ty * c, f + tx * b + ty * dd];
            st.tm = [...st.tlm];
            break;
          }
          case "Tm": st.tm = args.slice(0, 6).map(num); st.tlm = [...st.tm]; break;
          case "T*": newline(); break;
          case "Tc": st.charSpace = num(args[0]); break;
          case "Tw": st.wordSpace = num(args[0]); break;
          case "Tz": st.hScale = num(args[0]) || 100; break;
          case "TL": st.leading = num(args[0]); break;
          case "Tr": st.render = num(args[0]); break;
          case "Ts": st.rise = num(args[0]); break;
          case "Tj": if (args[0] && args[0].str) showText(args[0].str); break;
          case "'": newline(); if (args[0] && args[0].str) showText(args[0].str); break;
          case '"':
            st.wordSpace = num(args[0]); st.charSpace = num(args[1]);
            newline();
            if (args[2] && args[2].str) showText(args[2].str);
            break;
          case "TJ": {
            if (args[0] && args[0].arr) {
              for (const el of args[0].arr) {
                if (el && el.str) showText(el.str);
                else if (el && el.n !== undefined) advanceTm((-el.n / 1000) * st.fontSize * (st.hScale / 100));
              }
            }
            break;
          }
          case "Do": {
            if (!args[0] || !args[0].name) break;
            const xos = res["/XObject"] ? await doc.resolve(res["/XObject"]) : null;
            const xoRef = xos ? xos[args[0].name] : null;
            if (!xoRef) break;
            const v = await doc.resolve(xoRef);
            if (!v || !v.$stream) break;
            const sub = v.dict["/Subtype"];
            if (sub === "/Image") {
              const key = xoRef.$ref !== undefined ? xoRef.$ref : null;
              const imgCv = await decodeImageToCanvas(doc, res, v.dict, v.data, imgCache, key);
              if (imgCv) paintImage(ctx, st, imgCv);
            } else if (sub === "/Form" && depth < 8) {
              pushState(ctx, st);
              try {
                const m = v.dict["/Matrix"];
                if (Array.isArray(m) && m.length === 6) ctx.transform(num({ n: m[0] }), num({ n: m[1] }), num({ n: m[2] }), num({ n: m[3] }), num({ n: m[4] }), num({ n: m[5] }));
                const bb = v.dict["/BBox"];
                if (Array.isArray(bb) && bb.length === 4) {
                  const p = new Path2D();
                  p.rect(num({ n: bb[0] }), num({ n: bb[1] }), num({ n: bb[2] }) - num({ n: bb[0] }), num({ n: bb[3] }) - num({ n: bb[1] }));
                  ctx.clip(p);
                }
                const fres = v.dict["/Resources"] ? await doc.resolve(v.dict["/Resources"]) : res;
                const fops = tokenize(await doc.decodeStream(v));
                await execOps(fops, fres || res, ctx, st, depth + 1);
              } finally {
                popState(ctx, st);
              }
            }
            break;
          }
          case "__img__": {
            const im = args[0].img;
            const cvImg = await decodeImageToCanvas(doc, res, im.dict, im.data, imgCache, null);
            if (cvImg) paintImage(ctx, st, cvImg);
            break;
          }
          default: break; // ET / sh / marked content / BX / EX / unknown ops
        }
      } catch { /* skip broken operator */ }
    }
  }

  async function renderPage(pageRef, targetH = 380) {
    const [x0, y0, x1, y1] = pageRef.box;
    const bw = x1 - x0, bh = y1 - y0;
    const rot = ((pageRef.rotate % 360) + 360) % 360;
    const visW = rot % 180 === 0 ? bw : bh;
    const visH = rot % 180 === 0 ? bh : bw;
    if (!(visW > 0) || !(visH > 0)) return null;
    const scale = targetH / visH;
    const cw = Math.max(1, Math.round(visW * scale));
    const ch = targetH;
    const cv = document.createElement("canvas");
    cv.width = cw; cv.height = ch;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cw, ch);
    // device px → visual pt (y-up) → user space via page rotation
    ctx.translate(0, ch);
    ctx.scale(scale, -scale);
    if (rot === 90) ctx.transform(0, -1, 1, 0, -y0, x1);
    else if (rot === 180) ctx.transform(-1, 0, 0, -1, x1, y1);
    else if (rot === 270) ctx.transform(0, 1, -1, 0, y1, -x0);
    else ctx.translate(-x0, -y0);

    let res = pageRef.resourcesSrc ? await doc.resolve(pageRef.resourcesSrc) : null;
    res = res || {};
    let contents = pageRef.dict["/Contents"];
    contents = await doc.resolve(contents);
    const streams = Array.isArray(contents) ? contents : [contents];
    const parts = [];
    for (const s of streams) {
      const v = await doc.resolve(s);
      if (v && v.$stream) parts.push(await doc.decodeStream(v));
    }
    if (!parts.length) return cv; // blank page
    let total = 0;
    for (const p of parts) total += p.length + 1;
    const merged = new Uint8Array(total);
    let off = 0;
    for (const p of parts) { merged.set(p, off); off += p.length; merged[off++] = 10; }
    const ops = tokenize(merged);
    const st = {
      fill: [0, 0, 0], stroke: [0, 0, 0],
      fillCS: "/DeviceGray", strokeCS: "/DeviceGray",
      fillA: 1, strokeA: 1,
      tm: [1, 0, 0, 1, 0, 0], tlm: [1, 0, 0, 1, 0, 0],
      fontInfo: { cid: false }, fontSize: 12,
      charSpace: 0, wordSpace: 0, hScale: 100, leading: 0, render: 0, rise: 0,
      curX: 0, curY: 0,
      stack: [],
    };
    await execOps(ops, res, ctx, st, 0);
    return cv;
  }

  return { renderPage };
}
