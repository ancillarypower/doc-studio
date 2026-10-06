export function strBytes(s: any): Uint8Array;
export function inflate(data: any): Promise<Uint8Array>;
export function deflate(data: any): Promise<Uint8Array>;
export function serialize(v: any, parts: any): void;
export function serializeToBytes(v: any): Uint8Array;
export class PdfError extends Error {
    constructor(msg: any);
}
export function ref(num: any, gen?: number): {
    $ref: any;
    gen: number;
};
export function raw(bytes: any): {
    $raw: Uint8Array;
};
export function pdfString(s: any): {
    $raw: Uint8Array;
};
export class PdfDoc {
    static load(arrayBuffer: any, opts?: {}): Promise<PdfDoc>;
    constructor(bytes: any);
    bytes: any;
    xref: Map<any, any>;
    trailer: any;
    cache: Map<any, any>;
    objStmCache: Map<any, any>;
    readXrefChain(pos: any): Promise<void>;
    readXrefAt(pos: any): Promise<{
        entries: Map<any, any>;
        trailer: any;
    }>;
    readXrefStreamAt(pos: any): Promise<{
        entries: Map<any, any>;
        trailer: any;
    }>;
    decodeStream(s: any): Promise<any>;
    parseIndirectAt(pos: any): Promise<{
        num: number;
        gen: number;
        value: any;
    }>;
    getObject(num: any): Promise<any>;
    resolve(v: any, depth?: number): any;
    getPageRefs(): Promise<any[]>;
}
export class PdfUpdate {
    constructor(doc: any);
    doc: any;
    next: number;
    added: any[];
    replaced: any[];
    alloc(): number;
    addObject(value: any, gen?: number): {
        $ref: any;
        gen: number;
    };
    addStream(dict: any, data: any): {
        $ref: any;
        gen: number;
    };
    replaceObject(num: any, gen: any, value: any): void;
    build(): Promise<Uint8Array>;
}
