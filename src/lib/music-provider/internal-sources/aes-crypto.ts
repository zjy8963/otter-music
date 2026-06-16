// ============================================================
// AES-GCM & HMAC 工具函数（Web Crypto API）
//
// 用于 znnu / xiaoqin 等需要客户端加解密的内置源
// TS 5.9 中 Uint8Array 泛型与 BufferSource 不兼容，使用内联辅助
// ============================================================

function b64decode(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const v = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) v[i] = bin.charCodeAt(i);
  return buf;
}

function b64encode(data: ArrayBuffer | Uint8Array): string {
  const v = data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = "";
  for (let i = 0; i < v.length; i++) s += String.fromCharCode(v[i]);
  return btoa(s);
}

/** TS 5.9 兼容：Uint8Array → crypto 可用的 BufferSource */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asBuf = (v: ArrayBuffer | Uint8Array): any => v;

/** 随机 nonce */
function randomNonce(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12));
}

export async function aesGcmEncrypt(
  plaintext: Uint8Array,
  keyBytes: ArrayBuffer
): Promise<{ nonce: string; ciphertext: string; tag: string }> {
  const nonce = randomNonce();
  const ck = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asBuf(nonce) }, ck, asBuf(plaintext));
  const buf = new Uint8Array(enc);
  return {
    nonce: b64encode(nonce),
    ciphertext: b64encode(buf.slice(0, -16)),
    tag: b64encode(buf.slice(-16)),
  };
}

export async function aesGcmDecrypt(
  nonceB64: string, ciphertextB64: string, tagB64: string,
  keyBytes: ArrayBuffer
): Promise<Uint8Array> {
  const nonce = b64decode(nonceB64);
  const ct = b64decode(ciphertextB64);
  const tg = b64decode(tagB64);
  const combined = new Uint8Array(ct.byteLength + tg.byteLength);
  combined.set(new Uint8Array(ct), 0);
  combined.set(new Uint8Array(tg), ct.byteLength);
  const ck = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: asBuf(nonce) }, ck, asBuf(combined));
  return new Uint8Array(dec);
}

export async function hmacSha256(keyBytes: ArrayBuffer, message: string): Promise<string> {
  const ck = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", ck, asBuf(new TextEncoder().encode(message)));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}
