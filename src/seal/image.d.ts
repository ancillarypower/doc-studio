export function loadSealCanvas(file: any): Promise<HTMLCanvasElement>;
export function trimBlankMargins(src: any): {
    canvas: HTMLCanvasElement;
    trimmed: {
        top: number;
        left: number;
        bottom: number;
        right: number;
    };
    origW: any;
    origH: any;
};
export function rotateSeal(src: any, angleDeg: any): HTMLCanvasElement;
export function rotateQuarter(src: any): HTMLCanvasElement;
export function splitVertical(src: any, boundaries: any): any;
export function halfBoundaries(W: any): any[][];
export function sliceBoundaries(W: any, n: any): number[][];
export function inkCoverage(canvas: any): number;
export function canvasToPdfImage(canvas: any, deflateFn: any): Promise<{
    w: any;
    h: any;
    rgb: any;
    mask: any;
}>;
export function toGrayscale(src: any): HTMLCanvasElement;
export function applyOpacity(src: any, pct: any): any;
export function hasTransparency(src: any): boolean;
export function whiteToAlpha(src: any, cutoff?: number): HTMLCanvasElement;
