// Shared types for the 文件工坊 UI.
// Shared application types and PDF scan state.
import type { ScanReport } from "./pdf/sanitize";

export type Method = "A" | "B" | "C";
export type Align = "left" | "center-left" | "center" | "center-right" | "right";
export type Lang = string;
export type LinkMode = "keep" | "external" | "all";

export interface SanOptions {
  meta: boolean; history: boolean; js: boolean; attach: boolean; links: LinkMode;
  piece: boolean; outlines: boolean; exif: boolean; flatten: boolean; ocg: boolean; invisible: boolean;
}
export type SanBoolKey = Exclude<keyof SanOptions, "links">;

export type ScanState =
  | { status: "scanning"; done?: number; total?: number }
  | { status: "error"; msg: string }
  | { status: "done"; report: ScanReport };
