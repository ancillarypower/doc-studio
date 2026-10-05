// 貳區「檔案狀態」：上傳時掃描 PDF 裡看不到的東西（中繼資料、舊版本、JavaScript、附件、
// 連結、PieceInfo、書籤、EXIF、註解表單、隱藏圖層、隱形文字、數位簽章、疑似藏字），
// 以及產出時的「淨化」：整份重寫，只寫出從文件根節點追得到的物件，物件重新編號。
// All in memory, all in the browser. Content-stream edits only touch FlateDecode / unfiltered
// streams; anything else is left alone and reported.
import { PdfDoc, deflate, raw, serializeToBytes, strBytes } from "./pdf.js";
import { stringBytes } from "./crypt.js";

const isRef = (v) => v && typeof v === "object" && typeof v.$ref === "number";
const isDict = (v) => v && typeof v === "object" && !Array.isArray(v) && !v.$raw && !isRef(v) && !v.$stream;
const lat1 = (bytes) => { let s = ""; const CH = 0x8000; for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH)); return s; };
const fromLat1 = (s) => { const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 255; return out; };
const tick = () => new Promise((r) => setTimeout(r, 0));

const DANGER_ACTIONS = new Set(["/JavaScript", "/Launch", "/SubmitForm", "/ImportData"]);
const EXTERNAL_LINK = new Set(["/URI", "/GoToR", "/Launch", "/GoToE"]);

// ---------- object graph ----------
async function loadAll(doc) {
  const objs = new Map();
  let structural = 0;
  for (const [num, e] of doc.xref) {
    if (e.type !== 1 && e.type !== 2) continue;
    let v;
    try { v = await doc.getObject(num); } catch { continue; }
    if (v && v.$stream && (v.dict["/Type"] === "/XRef" || v.dict["/Type"] === "/ObjStm")) { structural++; continue; }
    if (isDict(v) && v["/Linearized"] !== undefined) { structural++; continue; }
    objs.set(num, v);
  }
  return { objs, structural };
}
const mkR = (objs) => (v) => {
  let d = 0;
  while (isRef(v) && d++ < 32) v = objs.has(v.$ref) ? objs.get(v.$ref) : null;
  return v ?? null;
};
function reachable(objs, roots) {
  const seen = new Set(), order = [], queue = [];
  const visit = (v) => {
    if (v == null || typeof v !== "object" || v.$raw) return;
    if (isRef(v)) {
      if (!seen.has(v.$ref) && objs.has(v.$ref)) { seen.add(v.$ref); order.push(v.$ref); queue.push(v.$ref); }
      return;
    }
    if (Array.isArray(v)) { for (const x of v) visit(x); return; }
    if (v.$stream) { visit(v.dict); return; }
    for (const k of Object.keys(v)) visit(v[k]);
  };
  for (const r of roots) visit(r);
  while (queue.length) visit(objs.get(queue.shift()));
  return order;
}
// every dict nested in a value (stream dicts included), refs not followed
function eachDict(v, fn) {
  if (!v || typeof v !== "object" || v.$raw || isRef(v)) return;
  if (Array.isArray(v)) { for (const x of v) eachDict(x, fn); return; }
  if (v.$stream) { eachDict(v.dict, fn); return; }
  fn(v);
  for (const k of Object.keys(v)) eachDict(v[k], fn);
}

// ---------- text helpers ----------
export function pdfText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.replace(/^\//, "");
  if (typeof v === "number") return String(v);
  if (!v.$raw) return "";
  const b = stringBytes(v);
  if (b[0] === 0xfe && b[1] === 0xff) {
    let s = ""; for (let i = 2; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]);
    return s.replace(//g, "");
  }
  if (b[0] === 0xff && b[1] === 0xfe) {
    let s = ""; for (let i = 2; i + 1 < b.length; i += 2) s += String.fromCharCode(b[i] | (b[i + 1] << 8));
    return s.replace(//g, "");
  }
  const body = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? b.subarray(3) : b;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(body); } catch { return lat1(body); }
}
function pdfDate(v) {
  const s = pdfText(v);
  const m = /(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(s);
  if (!m) return s;
  return `${m[1]}-${m[2] || "01"}-${m[3] || "01"}${m[4] ? ` ${m[4]}:${m[5] || "00"}` : ""}`;
}
const clip = (s, n = 40) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// ---------- JPEG APP segments (EXIF / GPS / XMP / IPTC / comments) ----------
function jpegSegments(b) {
  if (!b || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const segs = [];
  let p = 2;
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) return { segs, sos: -1 };
    const m = b[p + 1];
    if (m === 0xff) { p++; continue; }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { p += 2; continue; }
    if (m === 0xda || m === 0xd9) return { segs, sos: p };
    const len = (b[p + 2] << 8) | b[p + 3];
    if (len < 2 || p + 2 + len > b.length) return { segs, sos: -1 };
    segs.push({ m, s: p, e: p + 2 + len, data: b.subarray(p + 4, p + 2 + len) });
    p += 2 + len;
  }
  return { segs, sos: -1 };
}
const startsWith = (data, str) => { for (let i = 0; i < str.length; i++) if (data[i] !== str.charCodeAt(i)) return false; return true; };
function exifHasGps(data) {
  try {
    const t = data.subarray(6);
    const le = t[0] === 0x49;
    const r16 = (o) => (le ? t[o] | (t[o + 1] << 8) : (t[o] << 8) | t[o + 1]);
    const r32 = (o) => (le ? (t[o] | (t[o + 1] << 8) | (t[o + 2] << 16) | (t[o + 3] << 24)) >>> 0 : ((t[o] << 24) | (t[o + 1] << 16) | (t[o + 2] << 8) | t[o + 3]) >>> 0);
    const ifd = r32(4);
    const n = r16(ifd);
    for (let i = 0; i < n && i < 500; i++) if (r16(ifd + 2 + i * 12) === 0x8825) return true;
  } catch { /* malformed EXIF */ }
  return false;
}
// metadata-only segments; APP0 (JFIF), APP2 (ICC profile) and APP14 (Adobe color transform) stay
const isMetaSeg = (m) => m === 0xe1 || (m >= 0xe3 && m <= 0xed) || m === 0xef || m === 0xfe;
function jpegInfo(b) {
  const j = jpegSegments(b);
  if (!j) return null;
  let exif = false, gps = false, other = false;
  for (const s of j.segs) {
    if (s.m === 0xe1 && startsWith(s.data, "Exif\0")) { exif = true; if (exifHasGps(s.data)) gps = true; }
    else if (isMetaSeg(s.m)) other = true;
  }
  return { exif, gps, other };
}
function jpegStrip(b) {
  const j = jpegSegments(b);
  if (!j || j.sos < 0) return null;
  const keep = j.segs.filter((s) => !isMetaSeg(s.m));
  if (keep.length === j.segs.length) return null;
  let len = 2 + (b.length - j.sos);
  for (const s of keep) len += s.e - s.s;
  const out = new Uint8Array(len);
  out[0] = 0xff; out[1] = 0xd8;
  let o = 2;
  for (const s of keep) { out.set(b.subarray(s.s, s.e), o); o += s.e - s.s; }
  out.set(b.subarray(j.sos), o);
  return out;
}
const isDct = (dict) => { const f = dict["/Filter"]; return f === "/DCTDecode" || (Array.isArray(f) && f.length === 1 && f[0] === "/DCTDecode"); };

// ---------- content-stream lexer ----------
const WSC = new Set([0, 9, 10, 12, 13, 32]);
const DLM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);
const NUM_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;
function skipString(src, i) {
  let depth = 0;
  const n = src.length;
  while (i < n) {
    const ch = src.charCodeAt(i);
    if (ch === 92) { i += 2; continue; }
    if (ch === 40) depth++;
    else if (ch === 41) { depth--; if (!depth) return i + 1; }
    i++;
  }
  return n;
}
function lex(src) {
  const n = src.length;
  const toks = [];
  let i = 0;
  while (i < n) {
    const c = src.charCodeAt(i);
    if (WSC.has(c)) { i++; continue; }
    if (c === 37) { while (i < n && src.charCodeAt(i) !== 10 && src.charCodeAt(i) !== 13) i++; continue; }
    const s = i;
    if (c === 40) { i = skipString(src, i); toks.push({ t: "str", s, e: i }); continue; }
    if (c === 60) {
      if (src.charCodeAt(i + 1) === 60) {
        let depth = 0;
        while (i < n) {
          const ch = src.charCodeAt(i);
          if (ch === 40) { i = skipString(src, i); continue; }
          if (ch === 60 && src.charCodeAt(i + 1) === 60) { depth++; i += 2; continue; }
          if (ch === 62 && src.charCodeAt(i + 1) === 62) { depth--; i += 2; if (!depth) break; continue; }
          i++;
        }
        toks.push({ t: "dict", s, e: i });
        continue;
      }
      i++;
      while (i < n && src.charCodeAt(i) !== 62) i++;
      i++;
      toks.push({ t: "hex", s, e: i });
      continue;
    }
    if (c === 91) {
      let depth = 0;
      while (i < n) {
        const ch = src.charCodeAt(i);
        if (ch === 40) { i = skipString(src, i); continue; }
        if (ch === 91) depth++;
        else if (ch === 93) { depth--; if (!depth) { i++; break; } }
        i++;
      }
      toks.push({ t: "arr", s, e: i });
      continue;
    }
    if (c === 93 || c === 123 || c === 125 || c === 41 || c === 62) { i++; continue; }
    if (c === 47) {
      i++;
      while (i < n && !WSC.has(src.charCodeAt(i)) && !DLM.has(src.charCodeAt(i))) i++;
      toks.push({ t: "name", v: src.slice(s, i), s, e: i });
      continue;
    }
    while (i < n && !WSC.has(src.charCodeAt(i)) && !DLM.has(src.charCodeAt(i))) i++;
    if (i === s) { i++; continue; }
    const w = src.slice(s, i);
    if (NUM_RE.test(w)) { toks.push({ t: "num", v: +w, s, e: i }); continue; }
    if (w === "true" || w === "false" || w === "null") { toks.push({ t: "lit", v: w, s, e: i }); continue; }
    if (w === "BI") { // inline image: BI … ID <binary> EI, kept as one opaque op
      const re = /[\0\t\n\f\r ]ID[\0\t\n\f\r ]/g;
      re.lastIndex = i - 1;
      const m = re.exec(src);
      let end = n;
      if (m) {
        for (let j = m.index + 4; j < n - 1; j++) {
          if (src.charCodeAt(j) === 69 && src.charCodeAt(j + 1) === 73 && WSC.has(src.charCodeAt(j - 1))) {
            const after = src.charCodeAt(j + 2);
            if (j + 2 >= n || WSC.has(after) || DLM.has(after)) { end = j + 2; break; }
          }
        }
      }
      toks.push({ t: "op", v: "BI", s, e: end });
      i = end;
      continue;
    }
    toks.push({ t: "op", v: w, s, e: i });
  }
  return toks;
}
function* ops(toks) {
  let args = [];
  for (const t of toks) {
    if (t.t === "op") { yield { op: t.v, args, s: args.length ? args[0].s : t.s, e: t.e }; args = []; }
    else args.push(t);
  }
}

// ---------- optional content (layers) ----------
function ocModel(cat, R) {
  const ocp = R(cat?.["/OCProperties"]);
  const all = [], hiddenNums = new Set();
  if (!isDict(ocp)) return { all, hiddenNums, isHidden: () => false };
  const ocgs = R(ocp["/OCGs"]);
  const D = R(ocp["/D"]) || {};
  const base = D["/BaseState"] || "/ON";
  const set = (v) => new Set((R(v) || []).filter(isRef).map((r) => r.$ref));
  const off = set(D["/OFF"]), on = set(D["/ON"]);
  for (const r of Array.isArray(ocgs) ? ocgs : []) {
    if (!isRef(r)) continue;
    const hidden = base === "/OFF" ? !on.has(r.$ref) : off.has(r.$ref);
    const name = pdfText(R(r)?.["/Name"]) || `圖層 ${r.$ref}`;
    all.push({ num: r.$ref, name, hidden });
    if (hidden) hiddenNums.add(r.$ref);
  }
  const isHidden = (v) => {
    const d = R(v);
    if (!isDict(d)) return false;
    if (d["/Type"] === "/OCMD") {
      const raw0 = d["/OCGs"];
      const lst = R(raw0);
      const arr = Array.isArray(lst) ? lst : raw0 ? [raw0] : [];
      if (!arr.length) return false;
      const vis = arr.map((x) => !(isRef(x) && hiddenNums.has(x.$ref)));
      const P = d["/P"] || "/AnyOn";
      const visible = P === "/AllOn" ? vis.every(Boolean) : P === "/AnyOff" ? vis.some((x) => !x) : P === "/AllOff" ? vis.every((x) => !x) : vis.some(Boolean);
      return !visible;
    }
    return isRef(v) ? hiddenNums.has(v.$ref) : false;
  };
  return { all, hiddenNums, isHidden };
}

// ---------- content decode helpers ----------
async function decodeToStr(doc, s) {
  if (!s || !s.$stream) return null;
  let f = s.dict["/Filter"];
  if (Array.isArray(f)) f = f.length === 0 ? undefined : f.length === 1 ? f[0] : "multi";
  if (f !== undefined && f !== "/FlateDecode" && f !== "/Fl") return null;
  try { return lat1(await doc.decodeStream(s)); } catch { return null; }
}
function contentList(v, R) {
  const c = R(v);
  if (!c) return [];
  if (c.$stream) return [v];
  if (Array.isArray(c)) return c.filter((x) => R(x)?.$stream);
  return [];
}
async function pageContent(doc, page, R) {
  const parts = [];
  for (const r of contentList(page["/Contents"], R)) {
    const s = await decodeToStr(doc, R(r));
    if (s === null) return null;
    parts.push(s);
  }
  return parts.join("\n");
}

// ---------- geometry ----------
const I6 = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
function boxOf(m, x0, y0, x1, y1) {
  const pts = [apply(m, x0, y0), apply(m, x1, y0), apply(m, x0, y1), apply(m, x1, y1)];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
const inBox = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
const cmyk2rgb = (c, m, y, k) => [1 - Math.min(1, c + k), 1 - Math.min(1, m + k), 1 - Math.min(1, y + k)];
const colorDist = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
const nums = (args) => args.filter((a) => a.t === "num").map((a) => a.v);

// ---------- scan interpreter (invisible / same-color / covered text, hidden layers) ----------
async function scanContent(doc, R, src, res, ctx, depth) {
  const toks = lex(src);
  const xobjs = R(res?.["/XObject"]) || {};
  const props = R(res?.["/Properties"]) || {};
  const exts = R(res?.["/ExtGState"]) || {};
  let gs = { ctm: ctx.ctm, fill: [0, 0, 0], tr: 0, ca: 1 };
  const stack = [];
  let tm = I6, tlm = I6, tl = 0, fs = 12;
  let rects = [], nonRect = false;
  const mc = [];
  let hid = 0;
  const textEvent = () => {
    if (hid) return;
    if (gs.tr === 3) { ctx.invisible++; return; }
    if (gs.tr === 1 || gs.tr === 5 || gs.tr === 7) return;
    const [x, y] = apply(gs.ctm, ...apply(tm, 0.3 * fs, 0.3 * fs));
    if (gs.fill) {
      let bg = [1, 1, 1], known = true;
      for (let k = ctx.fills.length - 1; k >= 0; k--) {
        const f = ctx.fills[k];
        if (inBox(f.box, x, y)) { if (f.color) bg = f.color; else known = false; break; }
      }
      if (known && colorDist(gs.fill, bg) < 0.06) ctx.same++;
    }
    if (ctx.points.length < 3000) ctx.points.push({ x, y, hit: false });
  };
  const cover = (box, color) => {
    for (const p of ctx.points) if (!p.hit && inBox(box, p.x, p.y)) { p.hit = true; ctx.covered++; }
    ctx.fills.push({ box, color });
    if (ctx.fills.length > 600) ctx.fills.splice(0, 100);
  };
  const Td = (tx, ty) => { tlm = mul([1, 0, 0, 1, tx, ty], tlm); tm = tlm; };
  for (const o of ops(toks)) {
    const { op, args } = o;
    switch (op) {
      case "BDC": {
        const h = args.length >= 2 && args[0].v === "/OC" && args[1].t === "name" && ctx.oc.isHidden(props[args[1].v]);
        if (h) ctx.ocUsed = true;
        mc.push(h); if (h) hid++;
        break;
      }
      case "BMC": mc.push(false); break;
      case "EMC": if (mc.pop()) hid--; break;
      case "q": stack.push(gs); gs = { ...gs }; break;
      case "Q": if (stack.length) gs = stack.pop(); break;
      case "cm": { const n = nums(args); if (n.length === 6) gs.ctm = mul(n, gs.ctm); break; }
      case "g": { const n = nums(args); if (n.length === 1) gs.fill = [n[0], n[0], n[0]]; break; }
      case "rg": { const n = nums(args); if (n.length === 3) gs.fill = n; break; }
      case "k": { const n = nums(args); if (n.length === 4) gs.fill = cmyk2rgb(...n); break; }
      case "cs": gs.fill = args[0]?.v === "/Pattern" ? null : [0, 0, 0]; break;
      case "sc": case "scn": {
        const n = nums(args);
        if (args.some((a) => a.t === "name")) gs.fill = null;
        else if (n.length === 1) gs.fill = [n[0], n[0], n[0]];
        else if (n.length === 3) gs.fill = n;
        else if (n.length === 4) gs.fill = cmyk2rgb(...n);
        else gs.fill = null;
        break;
      }
      case "gs": {
        const e = R(exts[args[0]?.v]);
        if (isDict(e) && typeof e["/ca"] === "number") gs.ca = e["/ca"];
        break;
      }
      case "Tr": { const n = nums(args); if (n.length) gs.tr = n[0]; break; }
      case "BT": tm = I6; tlm = I6; break;
      case "Tf": { const n = nums(args); if (n.length) fs = Math.abs(n[0]) || 12; break; }
      case "TL": { const n = nums(args); if (n.length) tl = n[0]; break; }
      case "Td": { const n = nums(args); if (n.length === 2) Td(n[0], n[1]); break; }
      case "TD": { const n = nums(args); if (n.length === 2) { tl = -n[1]; Td(n[0], n[1]); } break; }
      case "Tm": { const n = nums(args); if (n.length === 6) { tm = n; tlm = n; } break; }
      case "T*": Td(0, -tl); break;
      case "Tj": case "TJ": ctx.textOps++; textEvent(); break;
      case "'": case '"': ctx.textOps++; Td(0, -tl); textEvent(); break;
      case "re": { const n = nums(args); if (n.length === 4) rects.push(n); break; }
      case "m": case "l": case "c": case "v": case "y": case "h": nonRect = true; break;
      case "f": case "F": case "f*": case "B": case "B*": case "b": case "b*":
        if (!hid && !nonRect && gs.fill && gs.ca >= 0.9) {
          for (const [x, y, w, h] of rects) cover(boxOf(gs.ctm, x, y, x + w, y + h), gs.fill);
        }
        rects = []; nonRect = false;
        break;
      case "n": case "S": case "s": rects = []; nonRect = false; break;
      case "Do": {
        const name = args[0]?.v;
        const xo = R(xobjs[name]);
        if (!xo || !xo.$stream || hid) break;
        if (xo.dict["/OC"] !== undefined && ctx.oc.isHidden(xo.dict["/OC"])) { ctx.ocUsed = true; break; }
        if (xo.dict["/Subtype"] === "/Image") {
          ctx.images++;
          const box = boxOf(gs.ctm, 0, 0, 1, 1);
          if (!xo.dict["/SMask"] && !xo.dict["/Mask"] && gs.ca >= 0.9 && !xo.dict["/ImageMask"]) cover(box, null);
          else ctx.fills.push({ box, color: null });
        } else if (xo.dict["/Subtype"] === "/Form" && depth < 6) {
          const key = xobjs[name]?.$ref;
          if (key !== undefined && ctx.visiting.has(key)) break;
          const s = await decodeToStr(doc, xo);
          if (s === null) break;
          if (key !== undefined) ctx.visiting.add(key);
          const m = (R(xo.dict["/Matrix"]) || I6).map((x) => Number(R(x)));
          const saved = ctx.ctm;
          ctx.ctm = mul(m.length === 6 ? m : I6, gs.ctm);
          await scanContent(doc, R, s, R(xo.dict["/Resources"]) || res, ctx, depth + 1);
          ctx.ctm = saved;
          if (key !== undefined) ctx.visiting.delete(key);
        }
        break;
      }
      default: break;
    }
  }
}

// ---------- content editor (hidden layers / invisible text) ----------
export function stripContent(src, { hiddenMC, hiddenDo, invisible }) {
  const toks = lex(src);
  const out = [];
  let last = 0, changed = false;
  const mc = [];
  let hidIdx = -1, hidStart = 0, qd = 0, qmin = 0;
  let tr = 0;
  const trStack = [];
  const stats = { oc: 0, text: 0, dos: 0 };
  const cut = (s, e, rep) => { out.push(src.slice(last, s), rep); last = e; changed = true; };
  const closeHidden = (end) => {
    // keep the q/Q stack balanced: the removed span's net effect on the stack is replayed
    const rep = " " + "Q ".repeat(-qmin) + "q ".repeat(qd - qmin);
    cut(hidStart, end, rep);
    for (let k = 0; k < -qmin; k++) tr = trStack.length ? trStack.pop() : 0;
    for (let k = 0; k < qd - qmin; k++) trStack.push(tr);
    hidIdx = -1; stats.oc++;
  };
  for (const o of ops(toks)) {
    const { op, args } = o;
    if (hidIdx >= 0) {
      if (op === "BDC" || op === "BMC") mc.push(false);
      else if (op === "EMC") { mc.pop(); if (mc.length === hidIdx) closeHidden(o.e); }
      else if (op === "q") qd++;
      else if (op === "Q") { qd--; if (qd < qmin) qmin = qd; }
      continue;
    }
    switch (op) {
      case "BDC": {
        const h = !!hiddenMC && args.length >= 2 && args[0].v === "/OC" && args[1].t === "name" && hiddenMC(args[1].v);
        mc.push(h);
        if (h) { hidIdx = mc.length - 1; hidStart = o.s; qd = 0; qmin = 0; }
        break;
      }
      case "BMC": mc.push(false); break;
      case "EMC": mc.pop(); break;
      case "q": trStack.push(tr); break;
      case "Q": tr = trStack.length ? trStack.pop() : 0; break;
      case "Tr": if (args[0]?.t === "num") tr = args[0].v; break;
      case "Do": if (hiddenDo && args[0]?.t === "name" && hiddenDo(args[0].v)) { cut(o.s, o.e, " "); stats.dos++; } break;
      case "Tj": case "TJ": if (invisible && tr === 3) { cut(o.s, o.e, " "); stats.text++; } break;
      case "'": if (invisible && tr === 3) { cut(o.s, o.e, " T* "); stats.text++; } break;
      case '"':
        if (invisible && tr === 3 && args.length >= 3) {
          cut(o.s, o.e, ` ${src.slice(args[0].s, args[0].e)} Tw ${src.slice(args[1].s, args[1].e)} Tc T* `);
          stats.text++;
        }
        break;
      default: break;
    }
  }
  if (hidIdx >= 0) closeHidden(src.length);
  out.push(src.slice(last));
  return { out: changed ? out.join("") : src, changed, stats };
}

// ======================================================================
// scan
// ======================================================================
export async function scanPdf(bytes, onProgress) {
  const doc = await PdfDoc.load(bytes);
  const pages = await doc.getPageRefs();
  const { objs, structural } = await loadAll(doc);
  const R = mkR(objs);
  const trailer = doc.trailer;
  const cat = R(trailer["/Root"]) || {};
  const order = reachable(objs, [trailer["/Root"], trailer["/Info"]]);
  const reach = new Set(order);

  // 1. metadata
  const info = R(trailer["/Info"]);
  const INFO_KEYS = [["/Author", "作者"], ["/Creator", "製作軟體"], ["/Producer", "轉檔軟體"], ["/CreationDate", "建立時間"], ["/ModDate", "修改時間"], ["/Title", "標題"], ["/Subject", "主旨"], ["/Keywords", "關鍵字"]];
  const infoFields = [];
  if (isDict(info)) {
    for (const [k, label] of INFO_KEYS) {
      if (info[k] === undefined) continue;
      const v = /Date$/.test(k) ? pdfDate(R(info[k])) : pdfText(R(info[k])).trim();
      if (v) infoFields.push({ label, value: clip(v) });
    }
    const extra = Object.keys(info).filter((k) => !INFO_KEYS.some(([kk]) => kk === k) && k !== "/Trapped");
    if (extra.length) infoFields.push({ label: "自訂欄位", value: `${extra.length} 個` });
  }
  let xmpCount = 0, xmpTool = "";
  for (const num of reach) eachDict(objs.get(num), (d) => { if (d["/Metadata"] !== undefined) xmpCount++; });
  if (cat["/Metadata"]) {
    const s = await decodeToStr(doc, R(cat["/Metadata"]));
    if (s) {
      const m = /xmp:CreatorTool(?:="([^"]*)"|>([^<]*)<)/.exec(s) || /pdf:Producer(?:="([^"]*)"|>([^<]*)<)/.exec(s);
      if (m) xmpTool = clip((m[1] || m[2] || "").trim());
    }
  }
  const meta = { fields: infoFields, xmpCount, xmpTool, hasId: !!trailer["/ID"] };
  meta.detected = infoFields.length > 0 || xmpCount > 0 || meta.hasId;

  // 2. history (incremental saves) / unreferenced objects
  let eofs = 0;
  for (let i = 0; i + 4 < bytes.length; i++) {
    if (bytes[i] === 37 && bytes[i + 1] === 37 && bytes[i + 2] === 69 && bytes[i + 3] === 79 && bytes[i + 4] === 70) { eofs++; i += 4; }
  }
  const linearized = /\/Linearized/.test(lat1(bytes.subarray(0, 1024)));
  const revisions = Math.max(1, eofs - (linearized ? 1 : 0));
  const orphans = Math.max(0, objs.size - reach.size - (linearized ? 1 : 0));
  const history = { revisions, orphans, linearized, detected: revisions > 1 || orphans > 0 };

  // 3/4/5/6/8/12 — walk every reachable dict
  const js = { js: 0, launch: 0, submit: 0, importData: 0, aa: 0, openAction: null, namesJs: 0, xfa: false };
  const attach = { files: 0, names: [], fileAnnots: 0, portfolio: !!cat["/Collection"] };
  let pieceInfo = 0;
  const sig = { fields: 0, signed: 0, perms: !!cat["/Perms"] };
  for (const num of reach) {
    eachDict(objs.get(num), (d) => {
      const s = d["/S"];
      if (s === "/JavaScript" || d["/JS"] !== undefined) js.js++;
      else if (s === "/Launch") js.launch++;
      else if (s === "/SubmitForm") js.submit++;
      else if (s === "/ImportData") js.importData++;
      if (d["/AA"] !== undefined) { const aa = R(d["/AA"]); js.aa += isDict(aa) ? Object.keys(aa).length : 1; }
      if (d["/PieceInfo"] !== undefined) pieceInfo++;
      if (d["/EF"] !== undefined) {
        const nm = pdfText(R(d["/UF"])) || pdfText(R(d["/F"]));
        if (nm && attach.names.length < 8 && !attach.names.includes(nm)) attach.names.push(clip(nm, 32));
      }
      if (d["/FT"] === "/Sig") { sig.fields++; if (d["/V"] !== undefined) sig.signed++; }
    });
    const v = objs.get(num);
    if (v && v.$stream && v.dict["/Type"] === "/EmbeddedFile") attach.files++;
  }
  if (cat["/OpenAction"] !== undefined) {
    const a = R(cat["/OpenAction"]);
    js.openAction = Array.isArray(a) ? "跳到指定頁" : isDict(a) ? (pdfText(a["/S"]) || "動作") : "動作";
  }
  const names = R(cat["/Names"]);
  const countNameTree = (node, depth = 0) => {
    const nd = R(node);
    if (!isDict(nd) || depth > 20) return 0;
    let n = 0;
    const arr = R(nd["/Names"]);
    if (Array.isArray(arr)) n += Math.floor(arr.length / 2);
    const kids = R(nd["/Kids"]);
    if (Array.isArray(kids)) for (const k of kids) n += countNameTree(k, depth + 1);
    return n;
  };
  if (isDict(names)) {
    js.namesJs = countNameTree(names["/JavaScript"]);
    const ef = countNameTree(names["/EmbeddedFiles"]);
    if (ef > attach.files) attach.files = ef;
  }
  const acro = R(cat["/AcroForm"]);
  if (isDict(acro) && acro["/XFA"] !== undefined) js.xfa = true;
  js.detected = !!(js.js || js.launch || js.submit || js.importData || js.aa || js.openAction || js.namesJs || js.xfa);

  // per-page annotations (links / annots / forms)
  const links = { total: 0, external: 0, hosts: [] };
  const annots = { count: 0, types: {}, widgets: 0, noAP: 0, needAppearances: isDict(acro) && acro["/NeedAppearances"] === true };
  const TYPE_TC = { "/Text": "便利貼", "/FreeText": "文字方塊", "/Highlight": "螢光標記", "/Underline": "底線", "/StrikeOut": "刪除線", "/Squiggly": "波浪線", "/Square": "方框", "/Circle": "圓圈", "/Line": "線條", "/Polygon": "多邊形", "/PolyLine": "折線", "/Ink": "手繪", "/Stamp": "圖章", "/Caret": "插入符號", "/FileAttachment": "附件圖示", "/Widget": "表單欄位", "/Sound": "聲音", "/Movie": "影片", "/Screen": "多媒體", "/RichMedia": "多媒體", "/Redact": "塗黑標記", "/Watermark": "浮水印註解", "/3D": "3D" };
  for (const p of pages) {
    const arr = R(p.dict["/Annots"]);
    if (!Array.isArray(arr)) continue;
    for (const a of arr) {
      const ad = R(a);
      if (!isDict(ad)) continue;
      const st = ad["/Subtype"];
      if (st === "/Link") {
        links.total++;
        const act = R(ad["/A"]);
        if (isDict(act) && EXTERNAL_LINK.has(act["/S"])) {
          links.external++;
          if (act["/S"] === "/URI") {
            const u = pdfText(R(act["/URI"]));
            let host = u;
            try { host = new URL(u).host || u; } catch { /* keep raw */ }
            if (host && links.hosts.length < 5 && !links.hosts.includes(host)) links.hosts.push(clip(host, 36));
          }
        }
        continue;
      }
      if (st === "/Popup") continue;
      if (st === "/FileAttachment") attach.fileAnnots++;
      annots.count++;
      const label = TYPE_TC[st] || pdfText(st) || "其他";
      annots.types[label] = (annots.types[label] || 0) + 1;
      if (st === "/Widget") {
        annots.widgets++;
        const rc = (R(ad["/Rect"]) || []).map((x) => Number(R(x)));
        const area = rc.length === 4 ? Math.abs((rc[2] - rc[0]) * (rc[3] - rc[1])) : 0;
        if (!ad["/AP"] && ad["/FT"] !== "/Sig" && area > 1) annots.noAP++;
      }
    }
  }
  links.detected = links.total > 0;
  attach.detected = attach.files > 0 || attach.fileAnnots > 0 || attach.portfolio;
  annots.fields = (() => { const f = R(acro?.["/Fields"]); return Array.isArray(f) ? f.length : 0; })();
  annots.detected = annots.count > 0 || annots.fields > 0;
  sig.detected = sig.fields > 0 || sig.perms;

  // 6. PieceInfo + bookmarks
  let outlineCount = 0;
  const ol = R(cat["/Outlines"]);
  if (isDict(ol)) {
    const seen = new Set();
    const walk = (node, depth) => {
      let cur = node;
      while (cur && isRef(cur) && !seen.has(cur.$ref) && seen.size < 20000 && depth < 50) {
        seen.add(cur.$ref);
        const d = R(cur);
        if (!isDict(d)) break;
        outlineCount++;
        if (d["/First"]) walk(d["/First"], depth + 1);
        cur = d["/Next"];
      }
    };
    walk(ol["/First"], 0);
  }
  const piece = { pieceInfo, outlines: outlineCount, detected: pieceInfo > 0 || outlineCount > 0 };

  // 7. JPEG EXIF
  const exif = { jpegs: 0, exif: 0, gps: 0, other: 0 };
  for (const num of reach) {
    const v = objs.get(num);
    if (!v || !v.$stream || v.dict["/Subtype"] !== "/Image" || !isDct(v.dict)) continue;
    exif.jpegs++;
    const ji = jpegInfo(v.data);
    if (!ji) continue;
    if (ji.exif) exif.exif++;
    if (ji.gps) exif.gps++;
    if (ji.other && !ji.exif) exif.other++;
  }
  exif.detected = exif.exif > 0 || exif.other > 0;

  // 9/10/13 — page content
  const oc = ocModel(cat, R);
  const layers = { total: oc.all.length, hidden: oc.all.filter((l) => l.hidden).map((l) => clip(l.name, 24)) };
  const text = { invisiblePages: [], invisibleOps: 0, ocrPages: [], samePages: [], sameOps: 0, coveredPages: [], coveredOps: 0, unreadable: 0 };
  let ocUsed = false;
  for (let i = 0; i < pages.length; i++) {
    if (onProgress) onProgress(i + 1, pages.length);
    const p = pages[i];
    const src = await pageContent(doc, p.dict, R);
    if (src === null) { text.unreadable++; continue; }
    const ctx = { ctm: I6, oc, invisible: 0, same: 0, covered: 0, images: 0, textOps: 0, points: [], fills: [], visiting: new Set(), ocUsed: false };
    try { await scanContent(doc, R, src, R(p.resourcesSrc) || {}, ctx, 0); } catch { text.unreadable++; }
    if (ctx.ocUsed) ocUsed = true;
    if (ctx.invisible) {
      text.invisiblePages.push(i + 1); text.invisibleOps += ctx.invisible;
      if (ctx.images > 0) text.ocrPages.push(i + 1);
    }
    if (ctx.same) { text.samePages.push(i + 1); text.sameOps += ctx.same; }
    if (ctx.covered) { text.coveredPages.push(i + 1); text.coveredOps += ctx.covered; }
    if (i % 4 === 3) await tick();
  }
  layers.detected = layers.hidden.length > 0;
  layers.used = ocUsed;
  const invisible = { pages: text.invisiblePages, ops: text.invisibleOps, ocrPages: text.ocrPages, detected: text.invisibleOps > 0 };
  const hiddenText = { samePages: text.samePages, sameOps: text.sameOps, coveredPages: text.coveredPages, coveredOps: text.coveredOps, detected: text.sameOps > 0 || text.coveredOps > 0 };

  return {
    pageCount: pages.length, objects: objs.size, structural,
    meta, history, js, attach, links, piece, exif, annots, layers, invisible, sig, hiddenText,
    unreadablePages: text.unreadable,
  };
}

// ======================================================================
// sanitize (full rewrite)
// ======================================================================
// opts: { meta, js, attach, links: "keep" | "external" | "all", piece, outlines, exif, flatten, ocg, invisible }
export async function sanitizePdf(bytes, opts, onProgress) {
  const doc = await PdfDoc.load(bytes);
  const pages = await doc.getPageRefs();
  const { objs } = await loadAll(doc);
  const R = mkR(objs);
  let next = 1;
  for (const k of objs.keys()) if (k >= next) next = k + 1;
  for (const k of doc.xref.keys()) if (k >= next) next = k + 1;
  const addObj = (v) => { const n = next++; objs.set(n, v); return { $ref: n, gen: 0 }; };
  const mkStream = async (str) => {
    const data = await deflate(fromLat1(str));
    return { $stream: true, dict: { "/Filter": "/FlateDecode", "/Length": data.length }, data };
  };
  const trailer = doc.trailer;
  const cat = R(trailer["/Root"]);
  if (!isDict(cat)) throw new Error("找不到文件根節點（Catalog）");
  const st = { flattened: 0, flattenNoAP: 0, annotsRemoved: 0, linksRemoved: 0, ocSpans: 0, ocDos: 0, invisibleText: 0, contentSkipped: 0, exifStripped: 0, exifBytes: 0, jsRemoved: 0, attachRemoved: 0, metaRemoved: 0, pieceRemoved: 0, outlinesRemoved: false };
  const oc = ocModel(cat, R);

  // --- content edits: hidden layers / invisible text, on pages and form XObjects ---
  const editContent = opts.ocg || opts.invisible;
  const mkHidden = (res) => {
    const props = R(res?.["/Properties"]) || {};
    const xobjs = R(res?.["/XObject"]) || {};
    return {
      hiddenMC: opts.ocg ? (name) => oc.isHidden(props[name]) : null,
      hiddenDo: opts.ocg ? (name) => { const xo = R(xobjs[name]); return !!(xo && xo.$stream && xo.dict["/OC"] !== undefined && oc.isHidden(xo.dict["/OC"])); } : null,
      invisible: !!opts.invisible,
    };
  };
  if (editContent) {
    for (let i = 0; i < pages.length; i++) {
      if (onProgress) onProgress(`淨化頁面內容… ${i + 1}/${pages.length}`);
      const p = pages[i];
      const src = await pageContent(doc, p.dict, R);
      if (src === null) { st.contentSkipped++; continue; }
      const r = stripContent(src, mkHidden(R(p.resourcesSrc)));
      st.ocSpans += r.stats.oc; st.ocDos += r.stats.dos; st.invisibleText += r.stats.text;
      if (r.changed) p.dict["/Contents"] = addObj(await mkStream(r.out));
      if (i % 4 === 3) await tick();
    }
    for (const [num, v] of [...objs]) {
      if (!v || !v.$stream) continue;
      const d = v.dict;
      const isForm = d["/Subtype"] === "/Form" || (d["/BBox"] !== undefined && d["/Subtype"] === undefined && d["/PatternType"] === undefined);
      if (!isForm) continue;
      const src = await decodeToStr(doc, v);
      if (src === null) { st.contentSkipped++; continue; }
      const r = stripContent(src, mkHidden(R(d["/Resources"])));
      st.ocSpans += r.stats.oc; st.ocDos += r.stats.dos; st.invisibleText += r.stats.text;
      if (r.changed) {
        const data = await deflate(fromLat1(r.out));
        const nd = { ...d, "/Filter": "/FlateDecode", "/Length": data.length };
        delete nd["/DecodeParms"];
        objs.set(num, { $stream: true, dict: nd, data });
      }
    }
  }

  // --- annotations: flatten / links / attachment icons / hidden-layer annots ---
  for (const p of pages) {
    const arr = R(p.dict["/Annots"]);
    if (!Array.isArray(arr)) continue;
    const keep = [], draws = [];
    let res = null, k = 0;
    for (const a of arr) {
      const ad = R(a);
      if (!isDict(ad)) continue;
      const stp = ad["/Subtype"];
      if (stp === "/Link") {
        const act = R(ad["/A"]);
        const external = isDict(act) && EXTERNAL_LINK.has(act["/S"]);
        if (opts.links === "all" || (opts.links === "external" && external)) { st.linksRemoved++; continue; }
        keep.push(a); continue;
      }
      if (opts.ocg && ad["/OC"] !== undefined && oc.isHidden(ad["/OC"])) { st.annotsRemoved++; continue; }
      if (opts.attach && stp === "/FileAttachment") { st.attachRemoved++; continue; }
      if (!opts.flatten) { keep.push(a); continue; }
      if (stp === "/Popup") { st.annotsRemoved++; continue; }
      const flags = Number(R(ad["/F"])) || 0;
      if (!(flags & 2) && !(flags & 32)) {
        const ap = R(ad["/AP"]);
        let nRef = isDict(ap) ? ap["/N"] : null;
        let n = R(nRef);
        if (n && !n.$stream && isDict(n)) { const as = ad["/AS"]; nRef = as ? n[as] : null; n = R(nRef); }
        const rect = (R(ad["/Rect"]) || []).map((x) => Number(R(x)));
        const bbox = n && n.$stream ? (R(n.dict["/BBox"]) || []).map((x) => Number(R(x))) : [];
        if (n && n.$stream && isRef(nRef) && rect.length === 4 && bbox.length === 4) {
          const m = (R(n.dict["/Matrix"]) || I6).map((x) => Number(R(x)));
          const [bx0, by0, bx1, by1] = boxOf(m.length === 6 ? m : I6, bbox[0], bbox[1], bbox[2], bbox[3]);
          const rx0 = Math.min(rect[0], rect[2]), rx1 = Math.max(rect[0], rect[2]);
          const ry0 = Math.min(rect[1], rect[3]), ry1 = Math.max(rect[1], rect[3]);
          const bw = bx1 - bx0, bh = by1 - by0;
          if (bw > 0 && bh > 0 && rx1 > rx0 && ry1 > ry0) {
            if (!n.dict["/Subtype"]) { n.dict["/Type"] = "/XObject"; n.dict["/Subtype"] = "/Form"; }
            if (!res) {
              const base = R(p.dict["/Resources"] ?? p.resourcesSrc);
              res = isDict(base) ? { ...base } : {};
              const xo = R(res["/XObject"]);
              res["/XObject"] = isDict(xo) ? { ...xo } : {};
            }
            let name;
            do { name = `/APFlat${k++}`; } while (res["/XObject"][name] !== undefined);
            res["/XObject"][name] = nRef;
            const sx = (rx1 - rx0) / bw, sy = (ry1 - ry0) / bh;
            const f = (x) => String(parseFloat(x.toFixed(5)));
            draws.push(`q ${f(sx)} 0 0 ${f(sy)} ${f(rx0 - bx0 * sx)} ${f(ry0 - by0 * sy)} cm ${name} Do Q`);
            st.flattened++;
          } else st.flattenNoAP++;
        } else st.flattenNoAP++;
      }
      st.annotsRemoved++;
    }
    if (keep.length) p.dict["/Annots"] = keep; else delete p.dict["/Annots"];
    if (draws.length) {
      p.dict["/Resources"] = res;
      const list = contentList(p.dict["/Contents"], R);
      const pre = addObj(await mkStream("q\n"));
      const post = addObj(await mkStream("\nQ\n" + draws.join("\n") + "\n"));
      p.dict["/Contents"] = [pre, ...list, post];
    }
  }

  // --- catalog-level removals ---
  const names = R(cat["/Names"]);
  if (opts.js) {
    if (cat["/OpenAction"] !== undefined) { delete cat["/OpenAction"]; st.jsRemoved++; }
    if (isDict(names) && names["/JavaScript"] !== undefined) { delete names["/JavaScript"]; st.jsRemoved++; }
    const acro = R(cat["/AcroForm"]);
    if (isDict(acro) && acro["/XFA"] !== undefined) { delete acro["/XFA"]; st.jsRemoved++; }
  }
  if (opts.attach) {
    if (isDict(names) && names["/EmbeddedFiles"] !== undefined) { delete names["/EmbeddedFiles"]; st.attachRemoved++; }
    if (cat["/Collection"] !== undefined) { delete cat["/Collection"]; st.attachRemoved++; }
  }
  if (isDict(names) && !Object.keys(names).length) delete cat["/Names"];
  if (opts.outlines && cat["/Outlines"] !== undefined) {
    delete cat["/Outlines"]; st.outlinesRemoved = true;
    if (cat["/PageMode"] === "/UseOutlines") cat["/PageMode"] = "/UseNone";
  }
  if (opts.ocg) delete cat["/OCProperties"];
  if (opts.flatten) delete cat["/AcroForm"];

  // --- key-level removals on every object ---
  const dangerous = (v) => {
    const a = R(v);
    return isDict(a) && (DANGER_ACTIONS.has(a["/S"]) || a["/JS"] !== undefined);
  };
  for (const v of objs.values()) {
    eachDict(v, (d) => {
      if (opts.meta && d["/Metadata"] !== undefined) { delete d["/Metadata"]; st.metaRemoved++; }
      if (opts.piece && (d["/PieceInfo"] !== undefined || d["/LastModified"] !== undefined)) {
        if (d["/PieceInfo"] !== undefined) st.pieceRemoved++;
        delete d["/PieceInfo"]; delete d["/LastModified"];
      }
      if (opts.js) {
        if (d["/AA"] !== undefined) { delete d["/AA"]; st.jsRemoved++; }
        for (const k of ["/A", "/OpenAction"]) if (d[k] !== undefined && dangerous(d[k])) { delete d[k]; st.jsRemoved++; }
        if (d["/Next"] !== undefined) {
          const nx = R(d["/Next"]);
          if (Array.isArray(nx)) {
            const kept = nx.filter((x) => !dangerous(x));
            if (kept.length !== nx.length) { st.jsRemoved += nx.length - kept.length; if (kept.length) d["/Next"] = kept; else delete d["/Next"]; }
          } else if (dangerous(d["/Next"])) { delete d["/Next"]; st.jsRemoved++; }
        }
      }
      if (opts.attach) {
        if (d["/AF"] !== undefined) { delete d["/AF"]; st.attachRemoved++; }
        if (d["/EF"] !== undefined) { delete d["/EF"]; delete d["/RF"]; st.attachRemoved++; }
      }
      if (opts.ocg && d["/OC"] !== undefined) delete d["/OC"];
    });
  }

  // --- JPEG EXIF: cut the metadata segments, entropy data untouched (no re-encode) ---
  if (opts.exif) {
    for (const [num, v] of [...objs]) {
      if (!v || !v.$stream || v.dict["/Subtype"] !== "/Image" || !isDct(v.dict)) continue;
      const out = jpegStrip(v.data);
      if (!out) continue;
      st.exifStripped++; st.exifBytes += v.data.length - out.length;
      objs.set(num, { $stream: true, dict: { ...v.dict, "/Length": out.length }, data: out });
    }
  }

  // --- rewrite: only objects reachable from the root, renumbered 1..N ---
  const keepInfo = !opts.meta && trailer["/Info"] !== undefined;
  if (opts.meta && trailer["/Info"] !== undefined) st.metaRemoved++;
  const order = reachable(objs, keepInfo ? [trailer["/Root"], trailer["/Info"]] : [trailer["/Root"]]);
  const map = new Map(order.map((n, i) => [n, i + 1]));
  const remap = (v) => {
    if (v == null || typeof v !== "object" || v.$raw) return v;
    if (isRef(v)) return map.has(v.$ref) ? { $ref: map.get(v.$ref), gen: 0 } : null;
    if (Array.isArray(v)) return v.map(remap);
    if (v.$stream) { const d = remap(v.dict); d["/Length"] = v.data.length; return { $stream: true, dict: d, data: v.data }; }
    const o = {};
    for (const k of Object.keys(v)) o[k] = remap(v[k]);
    return o;
  };
  const parts = [new Uint8Array([...strBytes("%PDF-1.7\n%"), 0xe2, 0xe3, 0xcf, 0xd3, 10])];
  let pos = parts[0].length;
  const offsets = [];
  for (let i = 0; i < order.length; i++) {
    if (onProgress && i % 200 === 0) onProgress(`重寫文件物件… ${i}/${order.length}`);
    const head = strBytes(`${i + 1} 0 obj\n`), body = serializeToBytes(remap(objs.get(order[i]))), foot = strBytes("\nendobj\n");
    offsets.push(pos);
    parts.push(head, body, foot);
    pos += head.length + body.length + foot.length;
  }
  let xref = `xref\n0 ${order.length + 1}\n0000000000 65535 f\r\n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n\r\n`;
  const nt = { "/Size": order.length + 1, "/Root": remap(trailer["/Root"]) };
  if (keepInfo) nt["/Info"] = remap(trailer["/Info"]);
  if (opts.meta) {
    const rnd = crypto.getRandomValues(new Uint8Array(16));
    const hex = raw("<" + [...rnd].map((x) => x.toString(16).padStart(2, "0")).join("") + ">");
    nt["/ID"] = [hex, hex];
  } else if (trailer["/ID"]) {
    const id = R(trailer["/ID"]);
    if (Array.isArray(id)) nt["/ID"] = id.map((x) => R(x));
  }
  parts.push(strBytes(xref + "trailer\n"), serializeToBytes(nt), strBytes(`\nstartxref\n${pos}\n%%EOF\n`));
  let total = 0;
  for (const c of parts) total += c.length;
  const outBytes = new Uint8Array(total);
  let o = 0;
  for (const c of parts) { outBytes.set(c, o); o += c.length; }
  st.objectsBefore = objs.size; st.objectsAfter = order.length;
  return { bytes: outBytes, stats: st };
}
