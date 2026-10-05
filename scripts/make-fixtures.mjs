#!/usr/bin/env node
// Generates the two synthetic test PDFs used by CI and the demo page. No real documents involved.
//
//   fixtures/all-triggers.pdf  every item the 貳「檔案狀態」 scanner reports is present at least once:
//                              metadata (Info + XMP + /ID), an incremental update + an orphan object,
//                              JavaScript / OpenAction / page AA / Launch / SubmitForm / ImportData,
//                              an embedded file + file-attachment annotation, internal + external links,
//                              PieceInfo + bookmarks, a JPEG with EXIF GPS, a note + form field,
//                              a hidden layer (OCG OFF), invisible text (Tr 3), an empty signature
//                              field, same-colour text and text covered by a filled box.
//   fixtures/encrypted.pdf     RC4-128 (Standard security handler R3), user password "test1234",
//                              owner password "owner1234", for 參「移除密碼」.
//
// Usage: node scripts/make-fixtures.mjs [outDir]   (default: fixtures/)
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] || "fixtures";
const JPEG_GPS = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/4QC4RXhpZgAATU0AKgAAAAgAAwEPAAIAAAALAAAAMgEQAAIAAAAMAAAAPoglAAQAAAABAAAASgAAAABGaXh0dXJlQ2FtAABGYWtlTW9kZWwgMQAABAABAAIAAAACTgAAAAACAAUAAAADAAAAgAADAAIAAAACRQAAAAAEAAUAAAADAAAAmAAAAAAAAAAZAAAAAQAAAAIAAAABAAAAAAAAAAEAAAB5AAAAAQAAACAAAAABAAAAAAAAAAH/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAgADADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDlKK9g/wCFL/8AUf8A/JP/AO2Uf8KX/wCo/wD+Sf8A9srxPq1Tsfdf2vg/5/wf+R4/RXsH/Cl/+o//AOSf/wBso/4Uv/1H/wDyT/8AtlH1ap2D+18H/P8Ag/8AI8for2D/AIUv/wBR/wD8k/8A7ZR/wpf/AKj/AP5J/wD2yj6tU7B/a+D/AJ/wf+Qf8Lo/6gH/AJOf/a6P+F0f9QD/AMnP/tdeP0UfWancP7Iwf8n4v/M9g/4XR/1AP/Jz/wC10f8AC6P+oB/5Of8A2uvH6KPrNTuH9kYP+T8X/mewf8Lo/wCoB/5Of/a6P+F0f9QD/wAnP/tdeP0UfWancP7Iwf8AJ+L/AMz/2Q==", "base64"); // 48×32, EXIF Make/Model + GPS 25°02'N 121°32'E (fake)

const enc = (s) => Buffer.from(s, "latin1");
const ID0 = "5345414c2d46495854555245" + "00".repeat(4); // fixed 16-byte document ID (hex)

// ---------- tiny PDF writer: objects + classic xref, optional incremental update ----------
function writePdf(objs, trailerExtra, update) {
  const parts = [enc("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")];
  let off = parts[0].length;
  const xref = {};
  const put = (num, body) => {
    const b = Buffer.isBuffer(body) ? body : enc(body);
    const chunk = Buffer.concat([enc(`${num} 0 obj\n`), b, enc("\nendobj\n")]);
    xref[num] = off; parts.push(chunk); off += chunk.length;
  };
  const nums = Object.keys(objs).map(Number).sort((a, b) => a - b);
  for (const n of nums) put(n, objs[n]);
  const size = Math.max(...nums) + 1;
  const table = (entries) => {
    let s = "xref\n0 1\n0000000000 65535 f \n";
    for (const n of Object.keys(entries).map(Number).sort((a, b) => a - b)) s += `${n} 1\n${String(entries[n]).padStart(10, "0")} 00000 n \n`;
    return s;
  };
  const x1 = off;
  const t1 = table(xref) + `trailer\n<< /Size ${size} ${trailerExtra} >>\nstartxref\n${x1}\n%%EOF\n`;
  parts.push(enc(t1)); off += t1.length;
  if (update) {
    const upd = {};
    for (const [n, body] of Object.entries(update)) {
      const chunk = Buffer.concat([enc(`${n} 0 obj\n`), enc(body), enc("\nendobj\n")]);
      upd[n] = off; parts.push(chunk); off += chunk.length;
    }
    const x2 = off;
    const t2 = table(upd) + `trailer\n<< /Size ${size} ${trailerExtra} /Prev ${x1} >>\nstartxref\n${x2}\n%%EOF\n`;
    parts.push(enc(t2));
  }
  return Buffer.concat(parts);
}
const stream = (dict, data) => {
  const d = Buffer.isBuffer(data) ? data : enc(data);
  return Buffer.concat([enc(`<< ${dict} /Length ${d.length} >>\nstream\n`), d, enc("\nendstream")]);
};

// ---------- fixture 1: every scanner trigger ----------
function allTriggers() {
  const content = [
    "BT /F1 18 Tf 50 780 Td (Doc Studio test fixture: all scanner triggers) Tj ET",
    "BT /F1 11 Tf 50 750 Td (Synthetic file. Contains no real data.) Tj ET",
    // same-colour text: white on the (default) white page
    "q 1 g BT /F1 11 Tf 50 700 Td (same colour text) Tj ET Q",
    // covered text: drawn, then a solid box painted over it
    "BT /F1 11 Tf 50 660 Td (covered text) Tj ET",
    "q 0.2 g 45 650 120 20 re f Q",
    // invisible text (text render mode 3)
    "BT 3 Tr /F1 11 Tf 50 620 Td (invisible OCR-style text) Tj ET",
    // hidden optional-content layer
    "/OC /L1 BDC BT /F1 11 Tf 50 590 Td (text on a hidden layer) Tj ET EMC",
    // JPEG with EXIF GPS, away from the text so it covers nothing
    "q 96 0 0 64 400 560 cm /Im1 Do Q",
  ].join("\n");
  const xmp = '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmp:CreatorTool="FixtureMaker 1.0"/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
  const objs = {
    1: "<< /Type /Catalog /Pages 2 0 R /Metadata 10 0 R /OpenAction 20 0 R" +
       " /Names << /JavaScript 21 0 R /EmbeddedFiles 23 0 R >> /AcroForm 30 0 R" +
       " /Outlines 40 0 R /PageMode /UseOutlines /OCProperties << /OCGs [50 0 R] /D << /OFF [50 0 R] >> >>" +
       " /PieceInfo << /FixtureApp << /LastModified (D:20260101000000Z) /Private (x) >> >> >>",
    2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R" +
       " /Resources << /Font << /F1 4 0 R >> /XObject << /Im1 60 0 R >> /Properties << /L1 50 0 R >> >>" +
       " /AA << /O 22 0 R >> /Annots [70 0 R 71 0 R 72 0 R 73 0 R 31 0 R 32 0 R]" +
       " /PieceInfo << /FixtureApp << /LastModified (D:20260101000000Z) >> >> >>",
    4: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    5: stream("", content),
    6: "<< /Title (Fixture) /Author (Test Author) /Creator (FixtureMaker) /Producer (FixtureMaker 1.0)" +
       " /CreationDate (D:20260101000000+08'00') /Keywords (fixture) /CustomKey (custom) >>",
    10: stream("/Type /Metadata /Subtype /XML", xmp),
    20: "<< /S /JavaScript /JS (app.alert\\(\"fixture\"\\);) /Next [26 0 R] >>",
    21: "<< /Names [(init) 24 0 R] >>",
    22: "<< /S /Launch /F (calc.exe) >>",
    23: "<< /Names [(hello.txt) 27 0 R] >>",
    24: "<< /S /JavaScript /JS (console.println\\(\"doc-level\"\\);) >>",
    25: "<< /S /SubmitForm /F << /FS /URL /F (https://example.com/submit) >> >>",
    26: "<< /S /ImportData /F (data.fdf) >>",
    27: "<< /Type /Filespec /F (hello.txt) /UF (hello.txt) /EF << /F 28 0 R >> >>",
    28: stream("/Type /EmbeddedFile /Subtype /text#2Fplain", "hello from an embedded file\n"),
    30: "<< /Fields [31 0 R 32 0 R] >>",
    31: "<< /Type /Annot /Subtype /Widget /FT /Tx /T (name) /V (fixture) /Rect [50 480 250 500] /P 3 0 R /AA << /K 25 0 R >> >>",
    32: "<< /Type /Annot /Subtype /Widget /FT /Sig /T (signature) /Rect [0 0 0 0] /P 3 0 R >>",
    40: "<< /Type /Outlines /First 41 0 R /Last 41 0 R /Count 1 >>",
    41: "<< /Title (Fixture bookmark) /Parent 40 0 R /Dest [3 0 R /Fit] >>",
    50: "<< /Type /OCG /Name (Hidden layer) >>",
    60: stream("/Type /XObject /Subtype /Image /Width 48 /Height 32 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode", JPEG_GPS),
    70: "<< /Type /Annot /Subtype /Link /Rect [50 775 300 800] /Border [0 0 0] /A << /S /GoTo /D [3 0 R /Fit] >> >>",
    71: "<< /Type /Annot /Subtype /Link /Rect [50 745 300 765] /Border [0 0 0] /A << /S /URI /URI (https://example.com/) >> >>",
    72: "<< /Type /Annot /Subtype /Text /Rect [300 700 320 720] /Contents (A sticky note) /T (Reviewer) >>",
    73: "<< /Type /Annot /Subtype /FileAttachment /Rect [330 700 350 720] /FS 27 0 R /Contents (attachment) >>",
    99: "<< /Orphan (this object is not referenced from anywhere) >>",
  };
  const trailer = `/Root 1 0 R /Info 6 0 R /ID [<${ID0}> <${ID0}>]`;
  // incremental update: the "old version" the scanner should flag
  const update = { 6: "<< /Title (Fixture, revised) /Author (Test Author) /Producer (FixtureMaker 1.0) /ModDate (D:20260102000000+08'00') >>" };
  return writePdf(objs, trailer, update);
}

// ---------- fixture 2: RC4-128 encrypted (Standard handler, V2 R3) ----------
const PAD = Buffer.from("28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a", "hex");
const md5 = (...b) => createHash("md5").update(Buffer.concat(b)).digest();
function rc4(key, data) {
  const S = [...Array(256).keys()]; let j = 0;
  for (let i = 0; i < 256; i++) { j = (j + S[i] + key[i % key.length]) & 255; [S[i], S[j]] = [S[j], S[i]]; }
  const out = Buffer.alloc(data.length); let i = 0; j = 0;
  for (let k = 0; k < data.length; k++) { i = (i + 1) & 255; j = (j + S[i]) & 255; [S[i], S[j]] = [S[j], S[i]]; out[k] = data[k] ^ S[(S[i] + S[j]) & 255]; }
  return out;
}
const padPw = (pw) => Buffer.concat([enc(pw), PAD]).subarray(0, 32);
const xorKey = (key, i) => Buffer.from(key.map((b) => b ^ i));
function encrypted() {
  const userPw = "test1234", ownerPw = "owner1234", n = 16, P = -1084; // print + copy allowed, modify denied
  const id = Buffer.from(ID0, "hex");
  let ok = md5(padPw(ownerPw)); for (let i = 0; i < 50; i++) ok = md5(ok);
  let O = rc4(ok.subarray(0, n), padPw(userPw)); for (let i = 1; i <= 19; i++) O = rc4(xorKey(ok.subarray(0, n), i), O);
  const pb = Buffer.alloc(4); pb.writeInt32LE(P);
  let key = md5(padPw(userPw), O, pb, id); for (let i = 0; i < 50; i++) key = md5(key.subarray(0, n)); key = key.subarray(0, n);
  let U = rc4(key, md5(PAD, id)); for (let i = 1; i <= 19; i++) U = rc4(xorKey(key, i), U);
  U = Buffer.concat([U, Buffer.alloc(16)]);
  const objKey = (num) => md5(key, Buffer.from([num & 255, (num >> 8) & 255, (num >> 16) & 255, 0, 0])).subarray(0, Math.min(n + 5, 16));
  const hexStr = (num, s) => "<" + rc4(objKey(num), enc(s)).toString("hex") + ">";
  const content = "BT /F1 18 Tf 50 780 Td (Doc Studio encrypted fixture) Tj ET\nBT /F1 11 Tf 50 750 Td (User password: test1234) Tj ET";
  const objs = {
    1: "<< /Type /Catalog /Pages 2 0 R >>",
    2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>",
    4: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    5: stream("", rc4(objKey(5), enc(content))),
    6: `<< /Title ${hexStr(6, "Encrypted fixture")} /Producer ${hexStr(6, "FixtureMaker 1.0")} >>`,
    7: `<< /Filter /Standard /V 2 /R 3 /Length 128 /P ${P} /O <${O.toString("hex")}> /U <${U.toString("hex")}> >>`,
  };
  return writePdf(objs, `/Root 1 0 R /Info 6 0 R /Encrypt 7 0 R /ID [<${ID0}> <${ID0}>]`);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "all-triggers.pdf"), allTriggers());
writeFileSync(join(OUT, "encrypted.pdf"), encrypted());
console.log(`wrote ${OUT}/all-triggers.pdf and ${OUT}/encrypted.pdf`);
