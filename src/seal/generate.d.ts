export function generateSealedPdf({ pdfBytes, pagesPlan, sealImages, lang, onProgress }: {
    pdfBytes: any;
    pagesPlan: any;
    sealImages: any;
    lang: any;
    onProgress: any;
}): Promise<{
    bytes: Uint8Array;
    verified: boolean;
    pageCount: number;
    originalPageCount: number;
}>;
export function buildLabels(pageCount: any, lang: any, align: any, pageWidths: any, size?: number): {
    text: string;
    w: number;
}[];
export const LABEL_SIZE: 9;
export const LABEL_FONT: "/SealF1";
import { MM } from "./plan.js";
import { planPlacement } from "./plan.js";
import { mulberry32 } from "./plan.js";
import { labelText } from "../pdf/font.js";
import { textWidth } from "../pdf/font.js";
import { LABEL_ASCENT } from "../pdf/font.js";
import { LABEL_DESCENT } from "../pdf/font.js";
export { MM, planPlacement, mulberry32, labelText, textWidth, LABEL_ASCENT, LABEL_DESCENT };
