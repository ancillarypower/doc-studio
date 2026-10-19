import type { ProbeResult } from "../pdf/crypt";
import type { DecryptResult } from "../pdf/crypt";
import type { PostprocessStats } from "../pdf/postprocess";
import type { prepSealCanvas } from "../lib/helpers";
import type { PlacementResult } from "../seal/plan";
import type { Align, Lang, Method } from "../types";

// 目標大小：數值 + 單位 → bytes；各單位的合理範圍與預設值
export type SizeUnit = "MB" | "KB";

export interface MethodThumbProps { kind: string; sealUrl?: string | null; aspect: number; pageCount?: number }

// Watermark text is drawn with the loaded webfonts onto a full-page-size canvas
// (rotation + tiling baked in), then embedded like a seal image: one per unique page size.
export type WmColor = "grey" | "red" | "black";

// ---------- app state shapes ----------
export interface PageInfo { w: number; h: number; rotate: number }

export interface UnlockInfo {
  kind: "pw" | "perm";
  algo: string;
  as: DecryptResult["as"];
  denied: string[];
}

export interface SealInfo {
  w: number;
  h: number;
  origW?: number;
  origH?: number;
  trimmed?: ReturnType<typeof prepSealCanvas>["trimmed"]["trimmed"];
  downscaled?: boolean;
  bgRemoved?: boolean;
  bytes?: number;
}

export interface PdfInfo {
  name: string; bytes: Uint8Array; pages: PageInfo[]; count: number;
  tally: [string, number][]; rotatedCount: number; unlock?: UnlockInfo | null;
}

export interface SealState { canvas: HTMLCanvasElement; url: string; origUrl?: string; info: SealInfo }

export interface LockedState {
  name: string; bytes: Uint8Array; probe: ProbeResult; stage: string;
  pwError?: string | null; cached?: { bytes: Uint8Array; unlock: UnlockInfo } | null;
}

export interface PlainReport {
  plain: true;
  verified: boolean;
  count: number;
  grayDoc: boolean;
  compressQ: number;
  compressDesc: string;
  srcSize: number;
  unlock: UnlockInfo | null;
  sanDesc: string;
}

export interface SealedReport {
  plain?: false;
  verified: boolean;
  count: number;
  method: Method;
  align: Align;
  lang: Lang;
  seed: number;
  grayscale: boolean;
  sealOpacity: number;
  rotMin: number;
  rotMax: number;
  sealCount: number;
  labelSize: number;
  labelBottom: number;
  labelRot: number;
  blanks: number[];
  blankOK: boolean;
  conflicts: PlacementResult["conflicts"];
  skipped: boolean;
  wm: { text: string; size: number; opacity: number; angle: number; color: WmColor; tile: boolean } | null;
  grayDoc: boolean;
  compressQ: number;
  compressDesc: string;
  srcSize: number;
  baseSize: number;
  sanDesc: string;
  sigWarn: boolean;
  sealInfo: SealInfo;
  dpi: number;
}

export type ResultReport = PlainReport | SealedReport;

export interface ResultState { url: string; name: string; size: number; report: ResultReport }

export interface LogEntry { t: string; d?: string; msg: string }

export type FoldState = Record<string, boolean>;

// document post-processing pass (grayscale / JPEG re-encode) result
export interface PpResult { bytes: Uint8Array; stats: PostprocessStats; q: number; scale: number; target: number; reached?: boolean }

export interface PlanSeal { imgKey: string; x: number; y: number; w: number; h: number }
export interface DiagramSeal { dataURL: string; x: number; y: number; w: number; h: number }
export interface PlanLabel { text: string; x: number; yBottom: number; w: number; size: number; rot: number }
export interface DiagramLabel { x: number; w: number; bottomMm: number; rot: number }
export interface PlanPage { seals: PlanSeal[]; label: PlanLabel | null }
export interface DiagramPage { seals: DiagramSeal[]; label: DiagramLabel | null }
export interface SealPart { key: string; canvas: HTMLCanvasElement }
export type PlanConflict = PlacementResult["conflicts"][number];
