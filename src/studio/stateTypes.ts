import { type EngineData } from "../types";

// 目標大小：數值 + 單位 → bytes；各單位的合理範圍與預設值
export type SizeUnit = "MB" | "KB";

export interface MethodThumbProps { kind: string; sealUrl?: string | null; aspect: number; pageCount?: number }

// Watermark text is drawn with the loaded webfonts onto a full-page-size canvas
// (rotation + tiling baked in), then embedded like a seal image: one per unique page size.
export type WmColor = "grey" | "red" | "black";

// ---------- app state shapes ----------
export interface PdfInfo {
  name: string; bytes: Uint8Array; pages: EngineData[]; count: number;
  tally: [string, number][]; rotatedCount: number; unlock?: EngineData;
}

export interface SealState { canvas: HTMLCanvasElement; url: string; origUrl?: string; info: EngineData }

export interface LockedState {
  name: string; bytes: Uint8Array; probe: EngineData; stage: string;
  pwError?: string | null; cached?: { bytes: Uint8Array; unlock: EngineData } | null;
}

export interface ResultState { url: string; name: string; size: number; report: EngineData }

export interface LogEntry { t: string; d?: string; msg: string }

export type FoldState = Record<string, boolean>;

// document post-processing pass (grayscale / JPEG re-encode) result
export interface PpResult { bytes: Uint8Array; stats: EngineData; q: number; scale: number; target: number; reached?: boolean }

// per-page placement record (pt, visual space); seals carry imgKey (PDF) or dataURL (diagram)
export interface PlanPage { seals: EngineData[]; label: EngineData }
