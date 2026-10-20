// Hidden E2E hooks the app exposes on window (used by automated tests; kept from the artifact).
import type { Align, Lang, Method } from "./types";
import type { PlanConflict, SizeUnit, WmColor } from "./studio/stateTypes";
import type { PdfValue } from "./pdf/types";

declare global {
  interface SealTestOpts {
    realSeal?: boolean;
    method?: Method;
    align?: Align;
    lang?: Lang;
    seed?: number;
    grayscale?: boolean;
    sealOpacity?: number;
    rotMin?: number;
    rotMax?: number;
    sealCount?: number;
    labelSize?: number;
    labelBottom?: number;
    labelRot?: number;
    grayDoc?: boolean;
    compressPdf?: boolean;
    compressQuality?: number;
    compressMode?: "ratio" | "size";
    targetMB?: number | string;
    targetUnit?: SizeUnit;
    outName?: string;
    wmOn?: boolean;
    wmText?: string;
    wmSize?: number;
    wmOpacity?: number;
    wmAngle?: number;
    wmColor?: WmColor;
    wmTile?: boolean;
  }

  interface InspectResult {
    pages: number;
    size: number;
    colorOps: number;
    grayOps: number;
    images: { num: number; filter: string; cs: PdfValue; bytes: number }[];
  }

  interface SealStateSnapshot {
    pdf: boolean;
    seal: boolean;
    method: Method | null;
    plan: boolean;
    conflicts: PlanConflict[] | null;
    blanks: number[] | null;
    ready: boolean;
    canGenerate: boolean;
    result: boolean;
    error: string | null;
  }

  interface Window {
    __sealTest?: (pdfB64: string, pngB64: string, opts?: SealTestOpts) => Promise<boolean>;
    __sealInspect?: () => Promise<InspectResult | null>;
    __sealState?: () => SealStateSnapshot;
    __sealGenerate?: () => Promise<SealStateSnapshot>;
    __sealOutB64?: string;
  }
}
export {};
