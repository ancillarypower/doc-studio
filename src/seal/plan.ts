// Pure geometry planner: seal placement + page-number labels. No DOM, fully testable.
import type { Align, Method } from "../types";

export const MM = 72 / 25.4; // mm -> pt

// visual page size / placed seal size, both in pt
export interface Size { w: number; h: number }

// one placed seal part on a page (pt, visual space, y measured from the bottom edge)
export type PlannedSeal =
  | { part: "left" | "right"; pair: number; slot: number; x: number; y: number; w: number; h: number }
  | { part: "slice"; slice: number; slot: number; x: number; y: number; w: number; h: number; angle: number };

export interface PlannedLabel { x: number; yBottom: number; w: number }

export interface PagePlacement { seals: PlannedSeal[]; label: PlannedLabel | null }

export interface PairNote { type: "pair"; pair: number; slot: number; cy: number }
export interface SliceNote { type: "slices"; slot: number; angle: number; cy: number }
export interface VariationNote { type: "variation-limited"; pair: number }
export type PlanNote = PairNote | SliceNote | VariationNote;

export type PlanConflict = { type: "pair"; pages: [number, number] } | { type: "document" };

export interface PlacementResult { plans: PagePlacement[]; notes: PlanNote[]; conflicts: PlanConflict[] }

export interface PlacementOptions {
  pages: Size[];
  seal: Size;
  method: Method;
  align: Align;
  labelHeightPt: number;
  labelWidths: number[];
  rng: () => number;
  count?: number;
  labelBottomPt?: number;
  labelRotDeg?: number;
}

// vertical range for a seal center: hard limits (lo/hi) and the preferred middle band (prefLo/prefHi)
interface CyRange { lo: number; hi: number; prefLo: number; prefHi: number; ok: boolean; prefOk: boolean }

// horizontal x of a page-number label for a given alignment.
// center-left / center-right sit halfway between the margin position and center.
export function labelX(align: Align, pageW: number, w: number): number {
  const left = 10 * MM;
  const center = (pageW - w) / 2;
  const right = pageW - 10 * MM - w;
  if (align === "left") return left;
  if (align === "center-left") return (left + center) / 2;
  if (align === "center-right") return (center + right) / 2;
  if (align === "right") return right;
  return center;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// pages: [{w, h}] visual sizes in pt
// seal: {w, h} placed size in pt for the COMPLETE rotated seal
// label: labelHeightPt + labelWidths per page; labelBottomPt = distance of label baseline area from bottom edge;
//        labelRotDeg rotates the label, enlarging its reserved zone accordingly
// count: seals per pair (method A) / strips per document (method B); rng
export function planPlacement({ pages, seal, method, align, labelHeightPt, labelWidths, rng, count = 1, labelBottomPt = 10 * MM, labelRotDeg = 0 }: PlacementOptions): PlacementResult {
  const EDGE = 4 * MM; // min distance of seal from page top/bottom edges
  const labelRot = ((labelRotDeg || 0) * Math.PI) / 180;
  const plans: PagePlacement[] = pages.map(() => ({ seals: [], label: null }));
  const notes: PlanNote[] = [];
  const conflicts: PlanConflict[] = [];

  const labelRectFor = (i: number) => {
    const p = pages[i];
    const w = labelWidths[i];
    const x = labelX(align, p.w, w);
    // rotated labels occupy a taller zone: h*|cos| + w*|sin|
    const effH = labelHeightPt * Math.abs(Math.cos(labelRot)) + w * Math.abs(Math.sin(labelRot));
    return { x0: x, x1: x + w, top: labelBottomPt + effH, bottom: labelBottomPt };
  };

  // vertical center range for a seal of height h on page i, avoiding label zone if x-ranges overlap
  function cyRange(i: number, sealH: number, sx0: number, sx1: number): CyRange {
    const p = pages[i];
    let lo = sealH / 2 + EDGE;
    const hi = p.h - sealH / 2 - EDGE;
    const lr = labelRectFor(i);
    const xOverlap = sx1 > lr.x0 && sx0 < lr.x1;
    if (xOverlap) lo = Math.max(lo, lr.top + sealH / 2 + 1 * MM);
    const prefLo = Math.max(lo, p.h * 0.2 + sealH / 2);
    const prefHi = Math.min(hi, p.h * 0.8 - sealH / 2);
    return { lo, hi, prefLo, prefHi, ok: lo <= hi, prefOk: prefLo <= prefHi };
  }

  const sample = (range: CyRange): number | null => {
    if (range.prefOk) return range.prefLo + rng() * (range.prefHi - range.prefLo);
    if (range.ok) return range.lo + rng() * (range.hi - range.lo);
    return null;
  };

  // k mutually separated vertical centers inside a range (band sampling); null when they cannot fit
  function multiCy(range: CyRange, k: number, sep: number): number[] | null {
    if (k <= 1) {
      const cy = sample(range);
      return cy === null ? null : [cy];
    }
    const bands = (bLo: number, bHi: number): number[] | null => {
      const bw = (bHi - bLo) / k;
      if (bw < sep) return null;
      const out: number[] = [];
      for (let j = 0; j < k; j++) {
        const sLo = bLo + j * bw + sep / 2;
        const sHi = bLo + (j + 1) * bw - sep / 2;
        out.push(sLo + rng() * (sHi - sLo));
      }
      return out;
    };
    if (range.prefOk) {
      const r = bands(range.prefLo, range.prefHi);
      if (r) return r;
    }
    if (range.ok) return bands(range.lo, range.hi);
    return null;
  }

  if (method === "A") {
    // pairwise: `count` seals per consecutive pair (A = 橫蓋, C = 直蓋 share this geometry)
    const halfW = seal.w / 2;
    let prevCy: number | null = null;
    let prevAngle: number | null = null;
    for (let i = 0; i < pages.length - 1; i++) {
      const angle = () => -10 + rng() * 20;
      const rangeL = cyRange(i, seal.h, pages[i].w - halfW, pages[i].w);
      const rangeR = cyRange(i + 1, seal.h, 0, halfW);
      const lo = Math.max(rangeL.lo, rangeR.lo), hi = Math.min(rangeL.hi, rangeR.hi);
      const pLo = Math.max(rangeL.prefLo, rangeR.prefLo), pHi = Math.min(rangeL.prefHi, rangeR.prefHi);
      const joint: CyRange = { lo, hi, prefLo: pLo, prefHi: pHi, ok: lo <= hi, prefOk: pLo <= pHi };
      if (!joint.ok) {
        conflicts.push({ type: "pair", pages: [i + 1, i + 2] });
        continue;
      }
      let cys: number[] | null = null;
      if (count <= 1) {
        // up to 50 tries to differ from previous pair
        for (let t = 0; t < 50; t++) {
          const a = angle();
          const cy = sample(joint);
          if (cy === null) break;
          const okCy = prevCy === null || Math.abs(cy - prevCy) >= Math.min(12 * MM, (hi - lo) * 0.25);
          const okA = prevAngle === null || Math.abs(a - prevAngle) >= 2;
          if ((okCy && okA) || t === 49) {
            cys = [cy];
            prevAngle = a;
            if (!(okCy && okA)) notes.push({ type: "variation-limited", pair: i + 1 });
            break;
          }
        }
      } else {
        cys = multiCy(joint, count, seal.h * 1.08);
      }
      if (!cys) { conflicts.push({ type: "pair", pages: [i + 1, i + 2] }); continue; }
      cys.forEach((cy, slot) => {
        plans[i].seals.push({ part: "left", pair: i, slot, x: pages[i].w - halfW, y: cy - seal.h / 2, w: halfW, h: seal.h });
        plans[i + 1].seals.push({ part: "right", pair: i, slot, x: 0, y: cy - seal.h / 2, w: halfW, h: seal.h });
        notes.push({ type: "pair", pair: i + 1, slot, cy });
      });
      prevCy = cys[cys.length - 1];
    }
  } else {
    // method B: `count` strips, each a shared cy; N slices per strip, each sliceWmm wide
    const n = pages.length;
    const sliceW = seal.w / n; // seal.w already = n * sliceWmm
    const angle = -10 + rng() * 20; // consumed for seed stability
    let lo = -Infinity, hi = Infinity, pLo = -Infinity, pHi = Infinity;
    for (let i = 0; i < n; i++) {
      const r = cyRange(i, seal.h, pages[i].w - sliceW, pages[i].w);
      lo = Math.max(lo, r.lo); hi = Math.min(hi, r.hi);
      pLo = Math.max(pLo, r.prefLo); pHi = Math.min(pHi, r.prefHi);
    }
    const joint: CyRange = { lo, hi, prefLo: pLo, prefHi: pHi, ok: lo <= hi, prefOk: pLo <= pHi };
    const cys = multiCy(joint, count, seal.h * 1.08);
    if (!cys) {
      conflicts.push({ type: "document" });
    } else {
      cys.forEach((cy, slot) => {
        for (let i = 0; i < n; i++) {
          plans[i].seals.push({ part: "slice", slice: i, slot, x: pages[i].w - sliceW, y: cy - seal.h / 2, w: sliceW, h: seal.h, angle });
        }
        notes.push({ type: "slices", slot, angle, cy });
      });
    }
  }

  // labels
  for (let i = 0; i < pages.length; i++) {
    const lr = labelRectFor(i);
    plans[i].label = { x: lr.x0, yBottom: labelBottomPt, w: lr.x1 - lr.x0 };
  }
  return { plans, notes, conflicts };
}
