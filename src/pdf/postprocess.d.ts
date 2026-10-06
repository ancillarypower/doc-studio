export function grayContent(src: any): string;
export function postprocessPdf(bytes: any, { grayscale, jpegQuality, jpegScale, onProgress }?: {
    grayscale?: boolean;
    jpegQuality?: any;
    jpegScale?: number;
    onProgress?: (i: number, n: number) => void;
}): Promise<{
    bytes: Uint8Array;
    stats: {
        contents: number;
        images: number;
        jpegs: number;
        dropped: number;
    };
}>;
