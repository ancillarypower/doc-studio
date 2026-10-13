// PDF Standard Security Handler: decrypt-in-place for the 移除密碼 / 移除權限控制 options.
// Supports R2–R4 (RC4 40/128, AES-128) and R5/R6 (AES-256). Pure-JS MD5/RC4/AES; SHA-2 via
// Web Crypto. The decrypted document is re-written as a brand-new plain PDF (no /Encrypt),
// which then flows back into 壹區 exactly like a normal upload.
import { PdfDoc, PdfError, serializeToBytes, strBytes, raw } from "./pdf.js";
import type { PdfDict, PdfRaw, PdfStream, PdfValue } from "./types";

type CryptMethod = "RC4" | "AES128" | "AES256" | "NONE";
interface AesKey { w: Uint8Array; Nr: number }
// Standard security handler parameters read from the /Encrypt dictionary
interface SecurityHandler {
  V: number; R: number; P: number; id0: Uint8Array; encMeta: boolean; stm: CryptMethod; str: CryptMethod;
  encNum: number | null; O: Uint8Array; U: Uint8Array; OE: Uint8Array; UE: Uint8Array; n: number;
  algo: string; denied: string[];
}
interface AuthResult { key: Uint8Array; as: "user" | "owner" }
export interface PdfCrypt { encNum: number | null; decryptObject(num: number, gen: number, value: PdfValue): PdfValue }
export interface ProbeResult { ownerOnly: boolean; algo: string; denied: string[] }
export interface DecryptResult { bytes: Uint8Array; as: "user" | "owner"; algo: string; denied: string[] }

// ---------- MD5 ----------
const MD5_S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const MD5_K = new Int32Array(64).map((_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0);
export function md5(msg: Uint8Array): Uint8Array {
  const len = msg.length;
  const nBlocks = ((len + 8) >> 6) + 1;
  const buf = new Uint8Array(nBlocks * 64);
  buf.set(msg); buf[len] = 0x80;
  const bits = len * 8;
  buf[buf.length - 8] = bits & 255; buf[buf.length - 7] = (bits >>> 8) & 255;
  buf[buf.length - 6] = (bits >>> 16) & 255; buf[buf.length - 5] = (bits >>> 24) & 255;
  buf[buf.length - 4] = Math.floor(len / 2 ** 29) & 255;
  let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
  const M = new Int32Array(16);
  for (let off = 0; off < buf.length; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = buf[off + i * 4] | (buf[off + i * 4 + 1] << 8) | (buf[off + i * 4 + 2] << 16) | (buf[off + i * 4 + 3] << 24);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) & 15; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) & 15; }
      else { F = C ^ (B | ~D); g = (7 * i) & 15; }
      F = (F + A + MD5_K[i] + M[g]) | 0;
      A = D; D = C; C = B;
      B = (B + ((F << MD5_S[i]) | (F >>> (32 - MD5_S[i])))) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }
  const out = new Uint8Array(16);
  [a0, b0, c0, d0].forEach((v, i) => { for (let k = 0; k < 4; k++) out[i * 4 + k] = (v >>> (8 * k)) & 255; });
  return out;
}

// ---------- RC4 ----------
export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 255;
    const t = S[i]; S[i] = S[j]; S[j] = t;
  }
  const out = new Uint8Array(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 255; j = (j + S[i]) & 255;
    const t = S[i]; S[i] = S[j]; S[j] = t;
    out[k] = data[k] ^ S[(S[i] + S[j]) & 255];
  }
  return out;
}

// ---------- AES (128/256, CBC) ----------
const SBOX = new Uint8Array(256), INV = new Uint8Array(256);
(() => {
  let p = 1, q = 1;
  do {
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff; if (q & 0x80) q ^= 0x09;
    const x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
    SBOX[p] = (x ^ 0x63) & 0xff;
  } while (p !== 1);
  SBOX[0] = 0x63;
  for (let i = 0; i < 256; i++) INV[SBOX[i]] = i;
})();
const xt = (b: number) => ((b << 1) ^ (b & 0x80 ? 0x1b : 0)) & 0xff;
const mul = (a: number, b: number) => { let r = 0; while (b) { if (b & 1) r ^= a; a = xt(a); b >>= 1; } return r; };
const MUL: Record<number, Uint8Array> = {}; for (const m of [2, 3, 9, 11, 13, 14]) { MUL[m] = new Uint8Array(256); for (let i = 0; i < 256; i++) MUL[m][i] = mul(i, m); }

function expandKey(key: Uint8Array): AesKey {
  const Nk = key.length / 4, Nr = Nk + 6;
  const w = new Uint8Array(16 * (Nr + 1));
  w.set(key);
  let rcon = 1;
  for (let i = Nk; i < 4 * (Nr + 1); i++) {
    let t = w.slice((i - 1) * 4, i * 4);
    if (i % Nk === 0) {
      t = new Uint8Array([SBOX[t[1]] ^ rcon, SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]]);
      rcon = xt(rcon);
    } else if (Nk > 6 && i % Nk === 4) t = t.map((b) => SBOX[b]);
    for (let k = 0; k < 4; k++) w[i * 4 + k] = w[(i - Nk) * 4 + k] ^ t[k];
  }
  return { w, Nr };
}
function encBlock({ w, Nr }: AesKey, s: Uint8Array) {
  for (let i = 0; i < 16; i++) s[i] ^= w[i];
  const t = new Uint8Array(16);
  for (let r = 1; r <= Nr; r++) {
    for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) t[c * 4 + row] = SBOX[s[((c + row) & 3) * 4 + row]];
    if (r < Nr) {
      for (let c = 0; c < 4; c++) {
        const a0 = t[c * 4], a1 = t[c * 4 + 1], a2 = t[c * 4 + 2], a3 = t[c * 4 + 3];
        s[c * 4] = MUL[2][a0] ^ MUL[3][a1] ^ a2 ^ a3;
        s[c * 4 + 1] = a0 ^ MUL[2][a1] ^ MUL[3][a2] ^ a3;
        s[c * 4 + 2] = a0 ^ a1 ^ MUL[2][a2] ^ MUL[3][a3];
        s[c * 4 + 3] = MUL[3][a0] ^ a1 ^ a2 ^ MUL[2][a3];
      }
    } else s.set(t);
    for (let i = 0; i < 16; i++) s[i] ^= w[r * 16 + i];
  }
  return s;
}
function decBlock({ w, Nr }: AesKey, s: Uint8Array) {
  for (let i = 0; i < 16; i++) s[i] ^= w[Nr * 16 + i];
  const t = new Uint8Array(16);
  for (let r = Nr - 1; r >= 0; r--) {
    for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) t[((c + row) & 3) * 4 + row] = INV[s[c * 4 + row]];
    for (let i = 0; i < 16; i++) t[i] ^= w[r * 16 + i];
    if (r > 0) {
      for (let c = 0; c < 4; c++) {
        const a0 = t[c * 4], a1 = t[c * 4 + 1], a2 = t[c * 4 + 2], a3 = t[c * 4 + 3];
        s[c * 4] = MUL[14][a0] ^ MUL[11][a1] ^ MUL[13][a2] ^ MUL[9][a3];
        s[c * 4 + 1] = MUL[9][a0] ^ MUL[14][a1] ^ MUL[11][a2] ^ MUL[13][a3];
        s[c * 4 + 2] = MUL[13][a0] ^ MUL[9][a1] ^ MUL[14][a2] ^ MUL[11][a3];
        s[c * 4 + 3] = MUL[11][a0] ^ MUL[13][a1] ^ MUL[9][a2] ^ MUL[14][a3];
      }
    } else s.set(t);
  }
  return s;
}
export function aesCbcEncryptNoPad(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  const ks = expandKey(key);
  const out = new Uint8Array(data.length);
  let prev = iv;
  for (let o = 0; o + 16 <= data.length; o += 16) {
    const b = new Uint8Array(16);
    for (let i = 0; i < 16; i++) b[i] = data[o + i] ^ prev[i];
    encBlock(ks, b); out.set(b, o); prev = b;
  }
  return out;
}
export function aesCbcDecrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array, unpad = true): Uint8Array {
  const ks = expandKey(key);
  const n = data.length - (data.length % 16);
  const out = new Uint8Array(n);
  let prev = iv;
  for (let o = 0; o < n; o += 16) {
    const c = data.subarray(o, o + 16);
    const b = decBlock(ks, c.slice());
    for (let i = 0; i < 16; i++) out[o + i] = b[i] ^ prev[i];
    prev = c;
  }
  if (unpad && n) {
    const p = out[n - 1];
    if (p >= 1 && p <= 16) return out.subarray(0, n - p);
  }
  return out;
}

// ---------- helpers ----------
const sha = async (algo: string, data: Uint8Array) => new Uint8Array(await crypto.subtle.digest(algo, data));
const cat = (...arrs: Uint8Array[]) => {
  const out = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0));
  let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
};
const eq = (a: Uint8Array, b: Uint8Array, n: number) => { for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false; return true; };
const PAD = new Uint8Array([0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a]);
const padPw = (pw: Uint8Array) => cat(pw.subarray(0, 32), PAD.subarray(0, 32 - Math.min(32, pw.length)));

// PDF string token (raw bytes incl. delimiters) → bytes
export function stringBytes(v: PdfRaw): Uint8Array {
  const b = v.$raw;
  if (b[0] === 60) { // <hex>
    let hex = "";
    for (let i = 1; i < b.length - 1; i++) { const c = String.fromCharCode(b[i]); if (/[0-9a-fA-F]/.test(c)) hex += c; }
    if (hex.length % 2) hex += "0";
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }
  const out: number[] = [];
  for (let i = 1; i < b.length - 1; i++) {
    let c = b[i];
    if (c === 92) {
      c = b[++i];
      const map: Record<number, number> = { 110: 10, 114: 13, 116: 9, 98: 8, 102: 12 };
      if (map[c] !== undefined) out.push(map[c]);
      else if (c >= 48 && c <= 55) {
        let v = c - 48;
        for (let k = 0; k < 2 && b[i + 1] >= 48 && b[i + 1] <= 55; k++) v = v * 8 + (b[++i] - 48);
        out.push(v & 255);
      } else if (c === 13) { if (b[i + 1] === 10) i++; }
      else if (c === 10) { /* line continuation */ }
      else out.push(c);
    } else if (c === 13) { out.push(10); if (b[i + 1] === 10) i++; }
    else out.push(c);
  }
  return new Uint8Array(out);
}
const hexString = (bytes: Uint8Array) => {
  let s = "<";
  for (const x of bytes) s += x.toString(16).padStart(2, "0");
  return raw(s + ">");
};
const toBytes = async (doc: PdfDoc, v: PdfValue): Promise<Uint8Array> => { v = await doc.resolve(v); return v && (v as PdfRaw).$raw ? stringBytes(v as PdfRaw) : new Uint8Array(0); };

function pwCandidates(pw: string, modern: boolean): Uint8Array[] {
  const utf8 = strBytes(modern ? pw.normalize("NFKC") : pw);
  const list: Uint8Array[] = [];
  if (!modern && [...pw].every((ch) => ch.codePointAt(0)! <= 0xff)) list.push(new Uint8Array([...pw].map((ch) => ch.codePointAt(0)!)));
  list.push(modern ? utf8.subarray(0, 127) : utf8);
  return list;
}

// ---------- security handler ----------
async function readHandler(doc: PdfDoc): Promise<SecurityHandler> {
  const encRef = doc.trailer["/Encrypt"];
  const enc = await doc.resolve(encRef);
  if (!enc || enc["/Filter"] !== "/Standard") throw new PdfError("UNSUPPORTED_SECURITY");
  const V = Number(enc["/V"] ?? 0), R = Number(enc["/R"] ?? 2);
  const ids = doc.trailer["/ID"] ? await doc.resolve(doc.trailer["/ID"]) : null;
  const id0 = ids && ids[0] ? await toBytes(doc, ids[0]) : new Uint8Array(0);
  const encMeta = enc["/EncryptMetadata"] !== false;
  let stm: CryptMethod = "RC4", str: CryptMethod = "RC4";
  if (V >= 4) {
    const cf = (await doc.resolve(enc["/CF"])) || {};
    const pick = async (name: string | undefined): Promise<CryptMethod> => {
      if (!name || name === "/Identity") return "NONE";
      const f = (await doc.resolve(cf[name])) || {};
      const m = f["/CFM"];
      return m === "/AESV2" ? "AES128" : m === "/AESV3" ? "AES256" : m === "/V2" ? "RC4" : "NONE";
    };
    stm = await pick(enc["/StmF"]); str = await pick(enc["/StrF"]);
  }
  const P = Number(enc["/P"] ?? 0) | 0;
  const h = {
    V, R, P, id0, encMeta, stm, str,
    encNum: encRef && encRef.$ref !== undefined ? encRef.$ref : null,
    O: await toBytes(doc, enc["/O"]), U: await toBytes(doc, enc["/U"]),
    OE: await toBytes(doc, enc["/OE"]), UE: await toBytes(doc, enc["/UE"]),
    n: R === 2 ? 5 : Math.max(5, Math.min(16, Number(enc["/Length"] ?? 40) / 8)),
  } as SecurityHandler;
  h.algo = R >= 5 ? "AES-256" : (stm === "AES128" || str === "AES128") ? "AES-128" : `RC4-${h.n * 8}`;
  const denied: string[] = [];
  if (!(P & 4)) denied.push("列印");
  if (!(P & 8)) denied.push("修改");
  if (!(P & 16)) denied.push("複製");
  if (!(P & 32)) denied.push("註解");
  h.denied = denied;
  return h;
}

function legacyKey(h: SecurityHandler, pw: Uint8Array) {
  const p = new Uint8Array([h.P & 255, (h.P >>> 8) & 255, (h.P >>> 16) & 255, (h.P >>> 24) & 255]);
  let k = md5(cat(padPw(pw), h.O.subarray(0, 32), p, h.id0, h.R >= 4 && !h.encMeta ? new Uint8Array([255, 255, 255, 255]) : new Uint8Array(0)));
  if (h.R >= 3) for (let i = 0; i < 50; i++) k = md5(k.subarray(0, h.n));
  return k.slice(0, h.n);
}
function legacyUserOK(h: SecurityHandler, key: Uint8Array) {
  if (h.R === 2) return eq(rc4(key, PAD), h.U, 32);
  let x = rc4(key, md5(cat(PAD, h.id0)));
  for (let i = 1; i <= 19; i++) x = rc4(key.map((b) => b ^ i), x);
  return eq(x, h.U, 16);
}
function legacyOwnerToUser(h: SecurityHandler, pw: Uint8Array) {
  let k = md5(padPw(pw));
  if (h.R >= 3) for (let i = 0; i < 50; i++) k = md5(k);
  const rk = k.slice(0, h.n);
  if (h.R === 2) return rc4(rk, h.O.subarray(0, 32));
  let x = h.O.slice(0, 32);
  for (let i = 19; i >= 0; i--) x = rc4(rk.map((b) => b ^ i), x);
  return x;
}
async function hash6(h: SecurityHandler, pw: Uint8Array, salt: Uint8Array, udata: Uint8Array): Promise<Uint8Array> {
  if (h.R === 5) return sha("SHA-256", cat(pw, salt, udata));
  let K = await sha("SHA-256", cat(pw, salt, udata));
  for (let i = 0; ; ) {
    const unit = cat(pw, K, udata);
    const K1 = new Uint8Array(unit.length * 64);
    for (let r = 0; r < 64; r++) K1.set(unit, r * unit.length);
    const E = aesCbcEncryptNoPad(K.subarray(0, 16), K.subarray(16, 32), K1);
    let sum = 0; for (let j = 0; j < 16; j++) sum += E[j];
    K = await sha(["SHA-256", "SHA-384", "SHA-512"][sum % 3], E);
    i++;
    if (i >= 64 && E[E.length - 1] <= i - 32) break;
  }
  return K.subarray(0, 32);
}

// Try one password; returns { key, as: "user" | "owner" } or null
async function authenticate(h: SecurityHandler, password: string): Promise<AuthResult | null> {
  const modern = h.R >= 5;
  for (const pw of pwCandidates(password, modern)) {
    if (modern) {
      const U48 = h.U.subarray(0, 48);
      if (eq(await hash6(h, pw, h.O.subarray(32, 40), U48), h.O, 32)) {
        const ik = await hash6(h, pw, h.O.subarray(40, 48), U48);
        return { key: aesCbcDecrypt(ik, new Uint8Array(16), h.OE.subarray(0, 32), false), as: "owner" };
      }
      if (eq(await hash6(h, pw, h.U.subarray(32, 40), new Uint8Array(0)), h.U, 32)) {
        const ik = await hash6(h, pw, h.U.subarray(40, 48), new Uint8Array(0));
        return { key: aesCbcDecrypt(ik, new Uint8Array(16), h.UE.subarray(0, 32), false), as: "user" };
      }
    } else {
      const upw = legacyOwnerToUser(h, pw);
      const ok = legacyKey(h, upw);
      if (legacyUserOK(h, ok)) return { key: ok, as: "owner" };
      const uk = legacyKey(h, pw);
      if (legacyUserOK(h, uk)) return { key: uk, as: "user" };
    }
  }
  return null;
}

function makeCrypt(h: SecurityHandler, fileKey: Uint8Array): PdfCrypt {
  const objKey = (num: number, gen: number, aes: boolean) => {
    if (h.R >= 5) return fileKey;
    const k = md5(cat(fileKey, new Uint8Array([num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255]),
      aes ? strBytes("sAlT") : new Uint8Array(0)));
    return k.subarray(0, Math.min(16, h.n + 5));
  };
  const run = (method: CryptMethod, num: number, gen: number, data: Uint8Array) => {
    if (method === "NONE") return data;
    if (method === "RC4") return rc4(objKey(num, gen, false), data);
    if (data.length < 16) return new Uint8Array(0);
    return aesCbcDecrypt(objKey(num, gen, true), data.subarray(0, 16), data.subarray(16));
  };
  const walk = (v: PdfValue, num: number, gen: number): PdfValue => {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map((x) => walk(x, num, gen));
    if (v.$raw) return hexString(run(h.str, num, gen, stringBytes(v as PdfRaw)));
    if (v.$ref !== undefined) return v;
    const d = v as PdfDict;
    const sig = d["/Type"] === "/Sig" || d["/ByteRange"] !== undefined;
    const out: PdfDict = {};
    for (const k of Object.keys(d)) out[k] = sig && k === "/Contents" ? d[k] : walk(d[k], num, gen);
    return out;
  };
  return {
    encNum: h.encNum,
    decryptObject(num, gen, value) {
      if (value && (value as PdfStream).$stream) {
        const s = value as PdfStream;
        const t = s.dict["/Type"];
        if (t === "/XRef") return value;
        const dict = walk(s.dict, num, gen) as PdfDict;
        const skip = t === "/Metadata" && !h.encMeta;
        const data = skip ? s.data : run(h.stm, num, gen, s.data);
        dict["/Length"] = data.length;
        return { $stream: true, dict, data };
      }
      return walk(value, num, gen);
    },
  };
}

// Inspect an encrypted PDF: does it open with an empty password (= 權限密碼 only)?
export async function probeEncryption(bytes: Uint8Array): Promise<ProbeResult> {
  const doc = await PdfDoc.load(bytes, { allowEncrypted: true });
  const h = await readHandler(doc);
  const auth = await authenticate(h, "");
  return { ownerOnly: !!auth, algo: h.algo, denied: h.denied };
}

// Decrypt with `password` ("" for 權限密碼-only files). Returns null on a wrong password.
export async function decryptPdf(bytes: Uint8Array, password: string): Promise<DecryptResult | null> {
  const doc = await PdfDoc.load(bytes, { allowEncrypted: true });
  const h = await readHandler(doc);
  const auth = await authenticate(h, password);
  if (!auth) return null;
  doc.cache.clear(); doc.objStmCache.clear();
  doc.crypt = makeCrypt(h, auth.key);
  // full rewrite: every live object, decrypted, into a fresh single-section file
  const parts = [new Uint8Array([...strBytes("%PDF-1.7\n%"), 0xe2, 0xe3, 0xcf, 0xd3, 10])];
  let pos = parts[0].length;
  const offsets = new Map<number, { off: number; gen: number }>();
  const nums: number[] = [...doc.xref.keys()].sort((a, b) => a - b);
  for (const num of nums) {
    if (num === h.encNum) continue;
    const e = doc.xref.get(num);
    if (e.type !== 1 && e.type !== 2) continue;
    let v;
    try { v = await doc.getObject(num); } catch { continue; }
    if (v && v.$stream && (v.dict["/Type"] === "/XRef" || v.dict["/Type"] === "/ObjStm")) continue;
    const gen = e.type === 1 ? e.gen || 0 : 0;
    const head = strBytes(`${num} ${gen} obj\n`), body = serializeToBytes(v), foot = strBytes("\nendobj\n");
    offsets.set(num, { off: pos, gen });
    parts.push(head, body, foot);
    pos += head.length + body.length + foot.length;
  }
  const size = Math.max(...nums, 0) + 1;
  let xref = `xref\n0 ${size}\n0000000000 65535 f\r\n`;
  for (let i = 1; i < size; i++) {
    const o = offsets.get(i);
    xref += o ? `${String(o.off).padStart(10, "0")} ${String(o.gen).padStart(5, "0")} n\r\n` : "0000000000 00000 f\r\n";
  }
  const trailer: PdfDict = { "/Size": size, "/Root": doc.trailer["/Root"] };
  if (doc.trailer["/Info"]) trailer["/Info"] = doc.trailer["/Info"];
  if (doc.trailer["/ID"]) trailer["/ID"] = doc.trailer["/ID"];
  parts.push(strBytes(xref + "trailer\n"), serializeToBytes(trailer), strBytes(`\nstartxref\n${pos}\n%%EOF\n`));
  return { bytes: cat(...parts), as: auth.as, algo: h.algo, denied: h.denied };
}
