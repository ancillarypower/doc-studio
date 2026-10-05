// Orchestrates: parse PDF, embed font + seal images, overlay seals + page numbers, verify.
import { PdfDoc, PdfUpdate, PdfError, deflate, pdfString, ref, serializeToBytes } from "../pdf/pdf.js";
import { buildFont, encodeText, textWidth, labelText, LABEL_ASCENT, LABEL_DESCENT } from "../pdf/font.js";
import { MM, planPlacement, mulberry32 } from "./plan.js";

export const LABEL_SIZE = 9;
export const LABEL_FONT = "/SealF1";

function fmt(n) { return String(parseFloat(n.toFixed(3))); }

function overlayRotationPrefix(box, rotate) {
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0, h = y1 - y0;
  let m;
  if (rotate === 90) m = `0 1 -1 0 ${fmt(w)} 0 cm`;
  else if (rotate === 180) m = `-1 0 0 -1 ${fmt(w)} ${fmt(h)} cm`;
  else if (rotate === 270) m = `0 -1 1 0 0 ${fmt(h)} cm`;
  else m = null;
  const t = `1 0 0 1 ${fmt(x0)} ${fmt(y0)} cm`;
  return m ? m + "\n" + t : (x0 || y0 ? t : null);
}

// Many office-exported PDFs leave a top-down text transform active at the end
// of their first content stream. Since content streams share graphics state,
// an appended stream otherwise inherits that transform: labels flip and all
// planned coordinates are mirrored. Return the inverse of the first base cm
// when it is clearly a page-level transform.
async function inheritedBaseReset(doc, contents) {
  let first = contents;
  if (Array.isArray(first)) first = first[0];
  if (first?.$ref !== undefined) first = await doc.resolve(first);
  if (!first?.$stream) return null;
  const bytes = await doc.decodeStream(first);
  const text = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const match = text.match(/([-+]?(?:\d*\.?\d+))\s+([-+]?(?:\d*\.?\d+))\s+([-+]?(?:\d*\.?\d+))\s+([-+]?(?:\d*\.?\d+))\s+([-+]?(?:\d*\.?\d+))\s+([-+]?(?:\d*\.?\d+))\s+cm\b/);
  if (!match) return null;
  const [a, b, c, d, e, f] = match.slice(1).map(Number);
  const det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
  // Identity means there is no inherited page transform to cancel.
  if (Math.abs(a - 1) < 1e-9 && Math.abs(b) < 1e-9 &&
      Math.abs(c) < 1e-9 && Math.abs(d - 1) < 1e-9 &&
      Math.abs(e) < 1e-9 && Math.abs(f) < 1e-9) return null;
  const ia = d / det, ib = -b / det, ic = -c / det, id = a / det;
  const ie = (c * f - d * e) / det;
  const iff = (b * e - a * f) / det;
  return `${fmt(ia)} ${fmt(ib)} ${fmt(ic)} ${fmt(id)} ${fmt(ie)} ${fmt(iff)} cm`;
}

// Merge our font + images into the page's (possibly inherited) resources.
function mergeResources(origResources, fontRef, imageRefs) {
  const res = {};
  if (origResources && typeof origResources === "object" && !origResources.$raw) {
    for (const k of Object.keys(origResources)) {
      if (k !== "/Font" && k !== "/XObject") res[k] = origResources[k];
    }
  }
  const fontDict = {};
  const origFont = origResources?.["/Font"];
  if (origFont && typeof origFont === "object" && !origFont.$raw && !origFont.$ref) {
    for (const k of Object.keys(origFont)) fontDict[k] = origFont[k];
  }
  const xoDict = {};
  const origXo = origResources?.["/XObject"];
  if (origXo && typeof origXo === "object" && !origXo.$raw && !origXo.$ref) {
    for (const k of Object.keys(origXo)) xoDict[k] = origXo[k];
  }
  let fname = LABEL_FONT;
  let n = 1;
  while (fontDict[fname]) fname = "/SealF" + ++n;
  fontDict[fname] = fontRef;
  const imgNames = [];
  for (let i = 0; i < imageRefs.length; i++) {
    let iname = "/SealIm" + i;
    let m = i;
    while (xoDict[iname]) iname = "/SealIm" + ++m;
    xoDict[iname] = imageRefs[i];
    imgNames.push(iname);
  }
  res["/Font"] = fontDict;
  res["/XObject"] = xoDict;
  return { res, fontName: fname, imgNames };
}

export async function generateSealedPdf({ pdfBytes, pagesPlan, sealImages, lang, onProgress }) {
  // sealImages: [{key, w, h, rgb(deflated), mask(deflated|null)}]
  // pagesPlan: [{seals: [{imgKey, x, y, w, h}], label: {text, x, yBottom, w}}]
  const doc = await PdfDoc.load(pdfBytes);
  const pages = await doc.getPageRefs();
  const update = new PdfUpdate(doc);
  const fontRef = await buildFont(update);

  // embed images (dedupe by key)
  const refByKey = new Map();
  for (const img of sealImages) {
    if (refByKey.has(img.key)) continue;
    let maskRef = null;
    if (img.mask) {
      maskRef = update.addStream(
        { "/Type": "/XObject", "/Subtype": "/Image", "/Width": img.w, "/Height": img.h, "/ColorSpace": "/DeviceGray", "/BitsPerComponent": 8, "/Filter": "/FlateDecode", "/Length": img.mask.length },
        img.mask
      );
    }
    const dict = {
      "/Type": "/XObject", "/Subtype": "/Image", "/Width": img.w, "/Height": img.h,
      "/ColorSpace": "/DeviceRGB", "/BitsPerComponent": 8, "/Filter": "/FlateDecode", "/Length": img.rgb.length,
    };
    if (maskRef) dict["/SMask"] = maskRef;
    refByKey.set(img.key, update.addStream(dict, img.rgb));
  }

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const plan = pagesPlan[i];
    if (!plan) continue;
    let origContents = page.dict["/Contents"];
    const baseReset = await inheritedBaseReset(doc, origContents);
    const prefix = overlayRotationPrefix(page.box, page.rotate);
    const parts = [];
    parts.push("q\n");
    if (baseReset) parts.push(baseReset + "\n");
    if (prefix) parts.push(prefix + "\n");
    // seal parts for this page
    const imgRefs = [];
    const placements = [];
    for (const s of plan.seals) {
      imgRefs.push(refByKey.get(s.imgKey));
      placements.push(s);
    }
    const resolved = await doc.resolve(page.resourcesSrc);
    // Deep-resolve /Font and /XObject sub-dicts: they are often indirect
    // refs, and mergeResources needs to iterate their keys.
    let effectiveRes = resolved && resolved.$raw ? null : resolved;
    if (effectiveRes) {
      const fontVal = effectiveRes["/Font"];
      const xoVal   = effectiveRes["/XObject"];
      const needsCopy = (fontVal && fontVal.$ref !== undefined) ||
                        (xoVal  && xoVal.$ref  !== undefined);
      if (needsCopy) {
        effectiveRes = { ...effectiveRes };
        if (fontVal && fontVal.$ref !== undefined) {
          const f = await doc.resolve(fontVal);
          if (f && typeof f === "object" && !f.$raw) effectiveRes["/Font"] = f;
        }
        if (xoVal && xoVal.$ref !== undefined) {
          const x = await doc.resolve(xoVal);
          if (x && typeof x === "object" && !x.$raw) effectiveRes["/XObject"] = x;
        }
      }
    }
    const { res, fontName, imgNames } = mergeResources(
      effectiveRes,
      fontRef,
      imgRefs
    );
    placements.forEach((s, k) => {
      parts.push(`q ${fmt(s.w)} 0 0 ${fmt(s.h)} ${fmt(s.x)} ${fmt(s.y)} cm ${imgNames[k]} Do Q\n`);
    });
    // label (per-plan size / bottom distance / rotation angle)
    if (plan.label) {
      const size = plan.label.size ?? LABEL_SIZE;
      const rad = ((plan.label.rot ?? 0) * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const yBase = plan.label.yBottom + LABEL_DESCENT * size;
      const hex = encodeText(plan.label.text);
      parts.push(`BT ${fontName} ${fmt(size)} Tf 0 g ${fmt(cos)} ${fmt(sin)} ${fmt(-sin)} ${fmt(cos)} ${fmt(plan.label.x)} ${fmt(yBase)} Tm <${hex}> Tj ET\n`);
    }
    parts.push("Q\n");
    const content = new TextEncoder().encode(parts.join(""));
    const compressed = await deflate(content);
    const overlayRef = update.addStream({ "/Length": compressed.length, "/Filter": "/FlateDecode" }, compressed);
    // /Contents may be an indirect ref to an array; resolve so we append correctly
    if (origContents && origContents.$ref !== undefined) {
      const c = await doc.resolve(origContents);
      if (Array.isArray(c)) origContents = c;
    }
    let newContents;
    if (Array.isArray(origContents)) newContents = [...origContents, overlayRef];
    else if (origContents) newContents = [origContents, overlayRef];
    else newContents = overlayRef;
    // Write merged Resources as an indirect object (better Preview.app / macOS compat)
    const resFontRef = update.addObject(res["/Font"]);
    const resXoRef = update.addObject(res["/XObject"]);
    const indirectRes = { ...res, "/Font": resFontRef, "/XObject": resXoRef };
    const resRef = update.addObject(indirectRes);
    const newDict = { ...page.dict, "/Contents": newContents, "/Resources": resRef };
    update.replaceObject(page.ref, page.gen, newDict);
    onProgress?.(i + 1, pages.length);
  }

  const outBytes = await update.build();
  // verification pass: re-read output
  const check = await PdfDoc.load(outBytes);
  const outPages = await check.getPageRefs();
  const verified = outPages.length === pages.length;
  return { bytes: outBytes, verified, pageCount: pages.length, originalPageCount: pages.length };
}

export function buildLabels(pageCount, lang, align, pageWidths, size = LABEL_SIZE) {
  const labels = [];
  for (let i = 0; i < pageCount; i++) {
    const text = labelText(i + 1, pageCount, lang);
    const w = textWidth(text, size);
    labels.push({ text, w });
  }
  return labels;
}

export { MM, planPlacement, mulberry32, labelText, textWidth, LABEL_ASCENT, LABEL_DESCENT };
