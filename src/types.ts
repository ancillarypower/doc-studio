// Shared types for the 文件工坊 UI.
// The PDF / seal engines (src/pdf, src/seal) are still untyped JavaScript in phase A;
// values that flow straight out of them are typed as EngineData until phase B adds real types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EngineData = any;

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
  | { status: "done"; report: EngineData };
