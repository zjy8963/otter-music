declare module "pako" {
  interface InflateOptions {
    to?: "string";
    windowBits?: number;
    raw?: boolean;
  }
  export function inflate(data: Uint8Array, options?: InflateOptions): Uint8Array | string;
}
