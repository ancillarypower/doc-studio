// Hidden E2E hooks the app exposes on window (used by automated tests; kept from the artifact).
import type { EngineData } from "./types";

declare global {
  interface Window {
    __sealTest?: (pdfB64: string, pngB64: string, opts?: EngineData) => Promise<EngineData>;
    __sealInspect?: () => Promise<EngineData>;
    __sealState?: () => EngineData;
    __sealGenerate?: () => Promise<EngineData>;
    __sealOutB64?: string;
  }
}
export {};
