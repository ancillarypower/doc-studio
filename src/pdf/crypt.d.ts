export function md5(msg: any): Uint8Array;
export function rc4(key: any, data: any): Uint8Array;
export function aesCbcEncryptNoPad(key: any, iv: any, data: any): Uint8Array;
export function aesCbcDecrypt(key: any, iv: any, data: any, unpad?: boolean): Uint8Array;
export function stringBytes(v: any): Uint8Array;
export function probeEncryption(bytes: any): Promise<{
    ownerOnly: boolean;
    algo: any;
    denied: any;
}>;
export function decryptPdf(bytes: any, password: any): Promise<{
    bytes: Uint8Array;
    as: string;
    algo: any;
    denied: any;
}>;
