// Embeds the subset TC font as a Type0/CIDFontType2 font and encodes label text.
import { FONT_B64, FONT_METRICS } from "./sealFontData.js";
import { deflate, pdfString, type PdfUpdate } from "./pdf.js";
import type { PdfRef } from "./types";

type GlyphMetrics = { u: number; w: number };

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const UPM = FONT_METRICS.upm;
const GID_INFO = new Map<number, GlyphMetrics>(Object.entries(FONT_METRICS.cids).map(([gid, v]) => [Number(gid), v]));
const U2GID = new Map<number, number>([...GID_INFO.entries()].map(([gid, v]) => [v.u, gid]));

export function labelText(pageNum: number, total: number, lang: string): string {
  return lang === "en" ? `Page ${pageNum} of ${total}` : `第 ${pageNum} 頁，共 ${total} 頁`;
}

export function encodeText(str: string): string {
  // -> hex string of 2-byte BE CIDs (= glyph ids)
  let hex = "";
  for (const ch of str) {
    const gid = U2GID.get(ch.codePointAt(0)!);
    if (!gid) throw new Error("Glyph missing for " + ch);
    hex += gid.toString(16).padStart(4, "0");
  }
  return hex;
}

export function textWidth(str: string, fontSize: number): number {
  let w = 0;
  for (const ch of str) {
    const gid = U2GID.get(ch.codePointAt(0)!);
    if (!gid) throw new Error("Glyph missing for " + ch);
    w += GID_INFO.get(gid)!.w;
  }
  return (w * fontSize) / UPM;
}

export const LABEL_DESCENT = -FONT_METRICS.descent / UPM; // positive, in em
export const LABEL_ASCENT = FONT_METRICS.ascent / UPM;

export async function buildFont(update: PdfUpdate): Promise<PdfRef> {
  const ttf = b64ToBytes(FONT_B64);
  const compressed = await deflate(ttf);
  const fileRef = update.addStream(
    { "/Length": compressed.length, "/Length1": ttf.length, "/Filter": "/FlateDecode" },
    compressed
  );
  const name = "APSealLabel";
  const descRef = update.addObject({
    "/Type": "/FontDescriptor",
    "/FontName": "/" + name,
    "/Flags": 4,
    "/FontBBox": FONT_METRICS.bbox,
    "/ItalicAngle": FONT_METRICS.italicAngle,
    "/Ascent": FONT_METRICS.ascent,
    "/Descent": FONT_METRICS.descent,
    "/CapHeight": FONT_METRICS.capHeight,
    "/StemV": FONT_METRICS.stemV,
    "/FontFile2": fileRef,
  });
  // /W array: compact consecutive runs
  const gids = [...GID_INFO.keys()].sort((a, b) => a - b);
  const wArr: (number | number[])[] = [];
  let runStart: number | null = null, runWidths: number[] = [], prev: number | null = null;
  const flush = () => { if (runStart !== null) { wArr.push(runStart, runWidths); runStart = null; runWidths = []; } };
  for (const gid of gids) {
    if (runStart !== null && gid === prev! + 1) { runWidths.push(GID_INFO.get(gid)!.w); }
    else { flush(); runStart = gid; runWidths = [GID_INFO.get(gid)!.w]; }
    prev = gid;
  }
  flush();
  const cidFontRef = update.addObject({
    "/Type": "/Font",
    "/Subtype": "/CIDFontType2",
    "/BaseFont": "/" + name,
    "/CIDSystemInfo": { "/Registry": pdfString("Adobe"), "/Ordering": pdfString("Identity"), "/Supplement": 0 },
    "/FontDescriptor": descRef,
    "/DW": 1000,
    "/W": wArr,
    "/CIDToGIDMap": "/Identity",
  });
  // ToUnicode CMap
  const bf = gids.map((gid) => {
    const u = GID_INFO.get(gid)!.u;
    return `<${gid.toString(16).padStart(4, "0")}> <${u.toString(16).padStart(4, "0")}>`;
  });
  const cmap = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /${name}-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
${bf.length} beginbfchar
${bf.join("\n")}
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
  const cmapBytes = new TextEncoder().encode(cmap);
  const toUniRef = update.addStream({ "/Length": cmapBytes.length }, cmapBytes);
  return update.addObject({
    "/Type": "/Font",
    "/Subtype": "/Type0",
    "/BaseFont": "/" + name,
    "/Encoding": "/Identity-H",
    "/DescendantFonts": [cidFontRef],
    "/ToUnicode": toUniRef,
  });
}
