// Value shapes the PDF parser (pdf.js) produces and the engines walk.
// Each object shape declares the other shapes' marker keys ($ref / $raw / $stream) as optional
// `undefined`, so the engines' runtime probes (`v.$raw`, `v.$stream`, …) type-check on any object
// value without casts, mirroring how the JavaScript tells the shapes apart.
export interface PdfRef { $ref: number; gen: number; $raw?: undefined; $stream?: undefined }
export interface PdfRaw { $raw: Uint8Array; $ref?: undefined; $stream?: undefined }
export interface PdfStream { $stream: true; dict: PdfDict; data: Uint8Array; $ref?: undefined; $raw?: undefined }
export interface PdfDict { [key: string]: PdfValue }
export interface PdfArray extends Array<PdfValue> { $ref?: undefined; $raw?: undefined; $stream?: undefined }
export type PdfObject = PdfRef | PdfRaw | PdfStream | PdfDict | PdfArray;
export type PdfValue = PdfObject | string | number | boolean | null;

// One page as PdfDoc.getPageRefs() returns it: the visible box (CropBox, else MediaBox) in user space,
// /Rotate normalized to 0–359, the page dict, and the /Resources it inherits or declares.
export interface PdfPageRef {
  index: number; ref: number | null; gen: number; dict: PdfDict;
  box: number[]; rotate: number; resourcesSrc: PdfValue;
}
