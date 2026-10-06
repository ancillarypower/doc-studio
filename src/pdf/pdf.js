// minipdf: a tiny PDF reader + incremental writer.
// Reads: classic xref tables, xref streams, object streams, FlateDecode (+PNG/TIFF predictors).
// Writes: incremental update appended to the original bytes (original objects stay byte-identical).

export class PdfError extends Error {
  constructor(msg) { super(msg); this.name = "PdfError"; }
}

const enc = new TextEncoder();
const dec = new TextDecoder("latin1");

export function strBytes(s) { return enc.encode(s); }

export async function inflate(data) {
  for (const fmt of ["deflate", "deflate-raw"]) {
    try {
      const ds = new DecompressionStream(fmt);
      const out = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
      return new Uint8Array(out);
    } catch (e) { /* try next format */ }
  }
  throw new PdfError("FlateDecode decompression failed");
}

export async function deflate(data) {
  const cs = new CompressionStream("deflate");
  const out = await new Response(new Blob([data]).stream().pipeThrough(cs)).arrayBuffer();
  return new Uint8Array(out);
}

// ---------- value helpers ----------
export const ref = (num, gen = 0) => ({ $ref: num, gen });
export const raw = (bytes) => ({ $raw: bytes instanceof Uint8Array ? bytes : strBytes(bytes) });
export const pdfString = (s) => {
  // literal string with escaping
  let out = "(";
  for (const ch of s) {
    if (ch === "(" || ch === ")" || ch === "\\") out += "\\" + ch;
    else out += ch;
  }
  return raw(out + ")");
};
const isRef = (v) => v && typeof v === "object" && typeof v.$ref === "number";

// ---------- tokenizer / parser ----------
const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]); // ()<>[]{}/%

class Parser {
  constructor(bytes, pos) { this.b = bytes; this.p = pos; }
  skipWs() {
    const b = this.b;
    while (this.p < b.length) {
      const c = b[this.p];
      if (WS.has(c)) { this.p++; continue; }
      if (c === 37) { // % comment
        while (this.p < b.length && b[this.p] !== 10 && b[this.p] !== 13) this.p++;
        continue;
      }
      break;
    }
  }
  peek() { return this.b[this.p]; }
  startsWithWord(w) {
    for (let i = 0; i < w.length; i++) if (this.b[this.p + i] !== w.charCodeAt(i)) return false;
    const after = this.b[this.p + w.length];
    return after === undefined || WS.has(after) || DELIM.has(after);
  }
  parseNumber() {
    const start = this.p; const b = this.b;
    while (this.p < b.length) {
      const c = b[this.p];
      if ((c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46) this.p++;
      else break;
    }
    const s = dec.decode(b.subarray(start, this.p));
    const n = Number(s);
    if (s === "" || Number.isNaN(n)) throw new PdfError("Bad number at " + start);
    return n;
  }
  parseName() {
    // current char is '/'
    this.p++;
    const start = this.p; const b = this.b;
    while (this.p < b.length && !WS.has(b[this.p]) && !DELIM.has(b[this.p])) this.p++;
    return "/" + dec.decode(b.subarray(start, this.p));
  }
  parseValue() {
    this.skipWs();
    const b = this.b; const c = b[this.p];
    if (c === 60) { // <
      if (b[this.p + 1] === 60) return this.parseDict();
      // hex string: keep raw including <>
      const start = this.p;
      this.p++;
      while (this.p < b.length && b[this.p] !== 62) this.p++;
      this.p++; // >
      return raw(b.slice(start, this.p));
    }
    if (c === 91) return this.parseArray();
    if (c === 47) return this.parseName();
    if (c === 40) { // literal string: keep raw including ()
      const start = this.p;
      let depth = 0;
      while (this.p < b.length) {
        const ch = b[this.p];
        if (ch === 92) { this.p += 2; continue; } // backslash escape
        if (ch === 40) depth++;
        else if (ch === 41) { depth--; if (depth === 0) { this.p++; break; } }
        this.p++;
      }
      return raw(b.slice(start, this.p));
    }
    if ((c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46) {
      const n1 = this.parseNumber();
      const save = this.p;
      try {
        this.skipWs();
        const c2 = b[this.p];
        if (c2 >= 48 && c2 <= 57) {
          const n2 = this.parseNumber();
          this.skipWs();
          if (b[this.p] === 82 && (b[this.p + 1] === undefined || WS.has(b[this.p + 1]) || DELIM.has(b[this.p + 1]))) {
            this.p++;
            return ref(n1, n2);
          }
        }
      } catch (e) { /* not a ref */ }
      this.p = save;
      return n1;
    }
    if (c === 116 && this.startsWithWord("true")) { this.p += 4; return true; }
    if (c === 102 && this.startsWithWord("false")) { this.p += 5; return false; }
    if (c === 110 && this.startsWithWord("null")) { this.p += 4; return null; }
    throw new PdfError("Unexpected token at byte " + this.p);
  }
  parseDict() {
    this.p += 2; // <<
    const d = {};
    for (;;) {
      this.skipWs();
      if (this.b[this.p] === 62 && this.b[this.p + 1] === 62) { this.p += 2; return d; }
      const key = this.parseValue();
      if (typeof key !== "string") throw new PdfError("Dict key is not a name at " + this.p);
      d[key] = this.parseValue();
    }
  }
  parseArray() {
    this.p++; // [
    const a = [];
    for (;;) {
      this.skipWs();
      if (this.b[this.p] === 93) { this.p++; return a; }
      a.push(this.parseValue());
    }
  }
}

// PNG/TIFF predictor decode (colors=1, bpc=8 — what xref/obj streams use)
function unpredict(data, params) {
  if (!params) return data;
  const pred = params["/Predictor"] ?? 1;
  if (pred === 1) return data;
  const cols = params["/Columns"] ?? 1;
  const colors = params["/Colors"] ?? 1;
  const bpc = params["/BitsPerComponent"] ?? 8;
  if (bpc !== 8) throw new PdfError("Unsupported predictor bpc " + bpc);
  const rowLen = cols * colors;
  if (pred === 2) { // TIFF
    const out = new Uint8Array(data.length);
    for (let r = 0; r * rowLen < data.length; r++) {
      const rowStart = r * rowLen;
      for (let i = 0; i < rowLen; i++) {
        const left = i >= colors ? out[rowStart + i - colors] : 0;
        out[rowStart + i] = (data[rowStart + i] + left) & 255;
      }
    }
    return out;
  }
  if (pred >= 10 && pred <= 15) {
    const stride = rowLen + 1;
    const rows = Math.floor(data.length / stride);
    const out = new Uint8Array(rows * rowLen);
    const paeth = (a, b, c) => {
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    };
    for (let r = 0; r < rows; r++) {
      const ft = data[r * stride];
      const row = data.subarray(r * stride + 1, r * stride + 1 + rowLen);
      const prev = r > 0 ? out.subarray((r - 1) * rowLen, r * rowLen) : new Uint8Array(rowLen);
      const orow = out.subarray(r * rowLen, (r + 1) * rowLen);
      for (let i = 0; i < rowLen; i++) {
        const a = i >= colors ? orow[i - colors] : 0;
        const bb = prev[i];
        const cc = i >= colors ? prev[i - colors] : 0;
        let v = row[i];
        if (ft === 1) v += a; else if (ft === 2) v += bb; else if (ft === 3) v += (a + bb) >> 1;
        else if (ft === 4) v += paeth(a, bb, cc);
        orow[i] = v & 255;
      }
    }
    return out;
  }
  throw new PdfError("Unsupported predictor " + pred);
}

export class PdfDoc {
  constructor(bytes) {
    this.bytes = bytes;
    this.xref = new Map(); // num -> {type:1,offset,gen} | {type:2,stm,idx}
    this.trailer = null;
    this.cache = new Map();
    this.objStmCache = new Map();
  }

  static async load(arrayBuffer, opts = {}) {
    const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
    const doc = new PdfDoc(bytes);
    // header check
    if (!(bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70))
      throw new PdfError("Not a PDF file");
    // find startxref from tail
    const tailStart = Math.max(0, bytes.length - 2048);
    const tail = dec.decode(bytes.subarray(tailStart));
    const idx = tail.lastIndexOf("startxref");
    if (idx < 0) throw new PdfError("startxref not found");
    const m = /startxref\s+(\d+)/.exec(tail.slice(idx));
    if (!m) throw new PdfError("startxref offset unreadable");
    doc.startxrefPos = Number(m[1]);
    await doc.readXrefChain(doc.startxrefPos);
    if (!doc.trailer) throw new PdfError("No trailer found");
    if (doc.trailer["/Encrypt"] && !opts.allowEncrypted) throw new PdfError("ENCRYPTED");
    return doc;
  }

  async readXrefChain(pos) {
    // newest first, then walk /Prev filling gaps
    let p = pos;
    let first = true;
    const seen = new Set();
    while (p !== null && p !== undefined && !seen.has(p)) {
      seen.add(p);
      const { entries, trailer } = await this.readXrefAt(p);
      for (const [num, e] of entries) if (!this.xref.has(num)) this.xref.set(num, e);
      if (first) { this.trailer = trailer; first = false; }
      // hybrid files: additional xref stream
      const xs = trailer["/XRefStm"];
      if (xs && !seen.has(xs)) {
        seen.add(xs);
        const extra = await this.readXrefStreamAt(xs);
        for (const [num, e] of extra.entries) if (!this.xref.has(num)) this.xref.set(num, e);
      }
      p = trailer["/Prev"] ?? null;
    }
  }

  async readXrefAt(pos) {
    const b = this.bytes;
    const parser = new Parser(b, pos);
    parser.skipWs();
    if (parser.startsWithWord("xref")) {
      parser.p += 4;
      const entries = new Map();
      for (;;) {
        parser.skipWs();
        if (parser.startsWithWord("trailer")) {
          parser.p += 7;
          const dict = parser.parseValue();
          return { entries, trailer: dict };
        }
        const firstObj = parser.parseNumber();
        parser.skipWs();
        const count = parser.parseNumber();
        // move to start of entry lines
        parser.skipWs();
        for (let i = 0; i < count; i++) {
          // 10-digit offset, space, 5-digit gen, space, type
          while (parser.p < b.length && (b[parser.p] === 13 || b[parser.p] === 10)) parser.p++;
          const lineStart = parser.p;
          const off = parseInt(dec.decode(b.subarray(lineStart, lineStart + 10)), 10);
          const gen = parseInt(dec.decode(b.subarray(lineStart + 11, lineStart + 16)), 10);
          const type = b[lineStart + 17];
          if (type === 110) entries.set(firstObj + i, { type: 1, offset: off, gen });
          // advance to next line (entries are 20 bytes incl EOL; be lenient)
          let e = lineStart + 18;
          if (b[e] === 13 && b[e + 1] === 10) e += 2;
          else if (b[e] === 13 || b[e] === 10) e += 1;
          else if (b[e] === 32 && b[e + 1] === 13) e += 3;
          else if (b[e] === 32 && b[e + 1] === 10) e += 2;
          else if (b[e] === 32) e += 1;
          parser.p = e;
        }
      }
    }
    // xref stream
    const r = await this.readXrefStreamAt(pos);
    return r;
  }

  async readXrefStreamAt(pos) {
    const obj = await this.parseIndirectAt(pos);
    const s = obj.value;
    if (!s || !s.$stream) throw new PdfError("xref stream expected at " + pos);
    const dict = s.dict;
    if (dict["/Type"] !== "/XRef") throw new PdfError("Not an xref stream at " + pos);
    const data = await this.decodeStream(s);
    const W = dict["/W"].map((x) => x);
    const size = dict["/Size"];
    const index = dict["/Index"] ? dict["/Index"].map((x) => x) : [0, size];
    const entries = new Map();
    let ptr = 0;
    const readField = (w) => {
      if (w === 0) return 0;
      let v = 0;
      for (let i = 0; i < w; i++) v = v * 256 + data[ptr++];
      return v;
    };
    for (let k = 0; k < index.length; k += 2) {
      const start = index[k], count = index[k + 1];
      for (let i = 0; i < count; i++) {
        const t = W[0] === 0 ? 1 : readField(W[0]);
        const f2 = readField(W[1]);
        const f3 = readField(W[2]);
        const num = start + i;
        if (t === 1) entries.set(num, { type: 1, offset: f2, gen: f3 });
        else if (t === 2) entries.set(num, { type: 2, stm: f2, idx: f3 });
      }
    }
    return { entries, trailer: dict };
  }

  async decodeStream(s) {
    let data = s.data;
    const dict = s.dict;
    let filters = dict["/Filter"];
    if (typeof filters === "string") filters = [filters];
    let parms = dict["/DecodeParms"];
    if (parms && !Array.isArray(parms)) parms = [parms];
    if (filters) {
      for (let i = 0; i < filters.length; i++) {
        const f = filters[i];
        const p = parms ? parms[i] : null;
        if (f === "/FlateDecode" || f === "/Fl") {
          data = unpredict(await inflate(data), p && typeof p === "object" && !p.$raw ? p : null);
        } else throw new PdfError("Unsupported filter " + f);
      }
    }
    return data;
  }

  async parseIndirectAt(pos) {
    const parser = new Parser(this.bytes, pos);
    parser.skipWs();
    const num = parser.parseNumber();
    parser.skipWs();
    const gen = parser.parseNumber();
    parser.skipWs();
    if (!parser.startsWithWord("obj")) throw new PdfError("obj expected at " + pos);
    parser.p += 3;
    let value = parser.parseValue();
    parser.skipWs();
    if (value && typeof value === "object" && !value.$raw && !value.$ref && !Array.isArray(value) && parser.startsWithWord("stream")) {
      parser.p += 6;
      if (this.bytes[parser.p] === 13 && this.bytes[parser.p + 1] === 10) parser.p += 2;
      else if (this.bytes[parser.p] === 10 || this.bytes[parser.p] === 13) parser.p += 1;
      let len = value["/Length"];
      if (isRef(len)) len = await this.getObject(len.$ref);
      const data = this.bytes.slice(parser.p, parser.p + len);
      value = { $stream: true, dict: value, data };
    }
    return { num, gen, value };
  }

  async getObject(num) {
    if (this.cache.has(num)) return this.cache.get(num);
    const entry = this.xref.get(num);
    if (!entry || entry.type === 0) throw new PdfError("Object " + num + " not found");
    let value;
    if (entry.type === 1) {
      const parsed = await this.parseIndirectAt(entry.offset);
      value = parsed.value;
      // encrypted source (移除密碼 flow): strings + streams of top-level objects get decrypted;
      // objects inside object streams are covered by their (decrypted) container
      if (this.crypt && num !== this.crypt.encNum) value = this.crypt.decryptObject(num, parsed.gen, value);
    } else {
      // object stream
      let stm = this.objStmCache.get(entry.stm);
      if (!stm) {
        const sobj = await this.getObject(entry.stm);
        const data = await this.decodeStream(sobj);
        const N = sobj.dict["/N"], First = sobj.dict["/First"];
        const header = new Parser(data, 0);
        const index = [];
        for (let i = 0; i < N; i++) {
          index.push(header.parseNumber()); header.skipWs();
          index.push(header.parseNumber()); header.skipWs();
        }
        stm = { data, First, index };
        this.objStmCache.set(entry.stm, stm);
      }
      const off = stm.index[entry.idx * 2 + 1];
      const parser = new Parser(stm.data, stm.First + off);
      value = parser.parseValue();
    }
    this.cache.set(num, value);
    return value;
  }

  async resolve(v, depth = 0) {
    if (isRef(v)) {
      if (depth > 20) throw new PdfError("ref loop");
      return this.resolve(await this.getObject(v.$ref), depth + 1);
    }
    return v;
  }


  async getPageRefs() {
    // walk again but keep refs to page objects
    const root = await this.resolve(this.trailer["/Root"]);
    const pagesRootRef = root["/Pages"];
    const out = [];
    const walk = async (nodeRef, inherited, depth) => {
      const node = await this.resolve(nodeRef);
      const inh = { ...inherited };
      for (const k of ["/MediaBox", "/CropBox", "/Resources", "/Rotate"]) {
        if (node[k] !== undefined) inh[k] = node[k];
      }
      if (node["/Type"] === "/Page") {
        const media = await this.resolve(inh["/MediaBox"]);
        const crop = inh["/CropBox"] ? await this.resolve(inh["/CropBox"]) : null;
        const box = (crop || media).map(Number);
        const rotate = ((Number(await this.resolve(inh["/Rotate"] ?? 0)) % 360) + 360) % 360;
        out.push({ index: out.length, ref: isRef(nodeRef) ? nodeRef.$ref : null, gen: isRef(nodeRef) ? nodeRef.gen : 0, dict: node, box, rotate, resourcesSrc: inh["/Resources"] ?? null });
        return;
      }
      const kids = await this.resolve(node["/Kids"]);
      for (const kid of kids) await walk(kid, inh, depth + 1);
    };
    await walk(pagesRootRef, {}, 0);
    if (out.some((p) => p.ref === null)) throw new PdfError("Page objects must be indirect");
    return out;
  }
}

// ---------- serializer ----------
function fmtNum(n) {
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toFixed(4)));
}

export function serialize(v, parts) {
  if (v === null || v === undefined) { parts.push("null"); return; }
  if (v === true) { parts.push("true"); return; }
  if (v === false) { parts.push("false"); return; }
  if (typeof v === "number") { parts.push(fmtNum(v)); return; }
  if (typeof v === "string") { parts.push(v); return; } // name (raw, e.g. "/Type")
  if (Array.isArray(v)) {
    parts.push("[");
    for (let i = 0; i < v.length; i++) { if (i) parts.push(" "); serialize(v[i], parts); }
    parts.push("]");
    return;
  }
  if (v.$raw) { parts.push(v.$raw); return; }
  if (isRef(v)) { parts.push(v.$ref + " " + v.gen + " R"); return; }
  if (v.$stream) {
    serialize(v.dict, parts);
    parts.push("\nstream\r\n");
    parts.push(v.data);
    parts.push("\r\nendstream");
    return;
  }
  // dict
  parts.push("<<");
  for (const k of Object.keys(v)) {
    if (k.startsWith("$")) continue;
    parts.push(" " + k + " ");
    serialize(v[k], parts);
  }
  parts.push(" >>");
}

export function serializeToBytes(v) {
  const parts = [];
  serialize(v, parts);
  let total = 0;
  const chunks = parts.map((p) => (typeof p === "string" ? strBytes(p) : p));
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// ---------- incremental writer ----------
export class PdfUpdate {
  constructor(doc) {
    this.doc = doc;
    const maxExisting = Math.max(doc.trailer["/Size"] ?? 0, ...[...doc.xref.keys()].map((k) => k + 1));
    this.next = maxExisting;
    this.added = []; // {num, gen, value}
    this.replaced = []; // {num, gen, value}
  }
  alloc() { return this.next++; }
  addObject(value, gen = 0) { const num = this.alloc(); this.added.push({ num, gen, value }); return ref(num, gen); }
  addStream(dict, data) { return this.addObject({ $stream: true, dict, data }); }
  replaceObject(num, gen, value) { this.replaced.push({ num, gen, value }); }

  async build() {
    const doc = this.doc;
    const out = [doc.bytes.slice()];
    let pos = doc.bytes.length;
    const entries = [];
    const all = [...this.added, ...this.replaced];
    for (const o of all) {
      const header = strBytes(`\n${o.num} ${o.gen} obj\n`);
      const bodyB = serializeToBytes(o.value);
      const footer = strBytes("\nendobj\n");
      entries.push({ num: o.num, gen: o.gen, offset: pos + 1 }); // +1 for leading \n
      out.push(header, bodyB, footer);
      pos += header.length + bodyB.length + footer.length;
    }
    // xref table with contiguous subsections
    entries.sort((a, b) => a.num - b.num);
    // The trailing \n in the footer above guarantees a line break before xref
    // (ISO 32000-1 §7.5.4 requires EOL after endobj).
    const xrefPos = pos;
    let i = 0; // subsection cursor
    let xrefStr = "xref\n";
    while (i < entries.length) {
      let j = i;
      while (j + 1 < entries.length && entries[j + 1].num === entries[j].num + 1) j++;
      xrefStr += `${entries[i].num} ${j - i + 1}\n`;
      for (let k = i; k <= j; k++) {
        xrefStr += String(entries[k].offset).padStart(10, "0") + " " + String(entries[k].gen).padStart(5, "0") + " n\r\n";
      }
      i = j + 1;
    }
    // trailer
    const size = Math.max(this.next, doc.trailer["/Size"] ?? 0);
    const trailer = { "/Size": size, "/Root": doc.trailer["/Root"], "/Prev": doc.startxrefPos ?? 0 };
    if (doc.trailer["/Info"]) trailer["/Info"] = doc.trailer["/Info"];
    if (doc.trailer["/ID"]) trailer["/ID"] = doc.trailer["/ID"];
    const trailerBytes = serializeToBytes(trailer);
    const tailStr = xrefStr + "trailer\n";
    out.push(strBytes(tailStr), trailerBytes, strBytes(`\nstartxref\n${xrefPos}\n%%EOF`));
    // concat
    let total = 0;
    for (const c of out) total += c.length;
    const result = new Uint8Array(total);
    let off = 0;
    for (const c of out) { result.set(c, off); off += c.length; }
    return result;
  }
}
