// ============================================================
// 歌词加密/解密工具
//
// - 网易云 EAPI: AES-128-ECB + PKCS7 + MD5 (node-forge)
// - QQ QRC:     TripleDES ECB + zlib 解压
// - 酷狗 KRC:    XOR + zlib 解压
//
// 严禁自己实现加密算法，优先使用已有的加密库 node-forge
// ============================================================

import forge from "node-forge";

// ============================================================
// Zlib 解压 (pako — 纯 JS，兼容所有浏览器)
// ============================================================

import { inflate } from "pako";

/** zlib 解压，pako 自动检测 zlib/raw deflate 格式 */
export async function zlibDecompress(data: Uint8Array): Promise<string | null> {
  try {
    return inflate(data, { to: "string" }) as string;
  } catch {
    return null;
  }
}

export async function decompressZlib(data: Uint8Array): Promise<Uint8Array | null> {
  try {
    return inflate(data) as Uint8Array;
  } catch {
    return null;
  }
}

// ============================================================
// 网易云 EAPI: AES-128-ECB（匹配 shared/src/utils/music/netease-crypto.ts）
// ============================================================

const EAPI_AES_KEY = "e82ckenh8dichen8";

/** MD5 hex digest */
export function md5Hex(text: string): string {
  return forge.md.md5.create().update(forge.util.encodeUtf8(text)).digest().toHex();
}

/**
 * AES 加密（与 shared/src/utils/music/netease-crypto.ts 的 aesEncrypt 一致）
 * node-forge 的 AES-ECB 模式自动处理 PKCS7 填充，不需要手动加
 */
function aesEncrypt(text: string, key: string, algo: "AES-CBC" | "AES-ECB", iv?: string): string {
  const cipher = forge.cipher.createCipher(algo, forge.util.createBuffer(key, "utf8"));
  if (algo === "AES-CBC" && iv) {
    cipher.start({ iv });
  } else {
    cipher.start({});
  }
  cipher.update(forge.util.createBuffer(text, "utf8"));
  cipher.finish();
  return cipher.output.data; // Binary string
}

/**
 * 网易云 EAPI 参数加密
 * 与 shared/src/utils/music/netease-crypto.ts 的 eapi() 完全一致
 *
 * path: 不带 /eapi/ 前缀的路径，如 "/api/song/lyric/v1"
 * object: 请求 payload
 */
export function encryptEapiParams(
  path: string,
  payload: Record<string, unknown>
): string {
  const text = JSON.stringify(payload);
  const message = `nobody${path}use${text}md5forencrypt`;
  const digest = forge.md.md5
    .create()
    .update(forge.util.encodeUtf8(message))
    .digest()
    .toHex();
  const data = `${path}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  const enc = aesEncrypt(data, EAPI_AES_KEY, "AES-ECB");
  return forge.util.bytesToHex(enc).toUpperCase();
}

// ============================================================
// QQ QRC: TripleDES ECB 解密 — 逐行移植 lyric_tripledes.py
//
// 关键：QQ 使用非标准 DES 密钥调度（perm_d 末尾不同于标准 DES）
//       必须精确匹配 Python 的 perm_d，不能用 forge 的标准 DES
// ============================================================

const ENCRYPT = 1;
const DECRYPT = 0;

const QRC_KEY_BYTES = new Uint8Array([
  0x21, 0x40, 0x23, 0x29, 0x28, 0x2a, 0x24, 0x25, // !@#)(*$%
  0x31, 0x32, 0x33, 0x5a, 0x58, 0x43, 0x21, 0x40, // 123ZXC!@
  0x21, 0x40, 0x23, 0x29, 0x28, 0x4e, 0x48, 0x4c, // !@#)(NHL
]);

// ---- Python sbox ----
const sbox: number[][] = [
  [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7, 0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8, 4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0, 15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
  [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10, 3,13,4,7,15,2,8,15,12,0,1,10,6,9,11,5, 0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15, 13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
  [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8, 13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1, 13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7, 1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
  [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15, 13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9, 10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4, 3,15,0,6,10,10,13,8,9,4,5,11,12,7,2,14],
  [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9, 14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6, 4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14, 11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
  [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11, 10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8, 9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6, 4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
  [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1, 13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6, 1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2, 6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
  [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7, 1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2, 7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8, 2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11],
];

// ---- bit ops (JS >>> = Python logical >>) ----
function _bitnum(a: Uint8Array, b: number, c: number): number {
  return ((a[Math.floor(b/32)*4+3 - Math.floor((b%32)/8)] >>> (7 - b%8)) & 1) << c;
}
function _bitnum_intr(a: number, b: number, c: number): number {
  return ((a >>> (31 - b)) & 1) << c;
}
function _bitnum_intl(a: number, b: number, c: number): number {
  return ((a << b) & 0x80000000) >>> c;  // >>> 关键！
}
function _sbox_bit(a: number): number {
  return (a & 32) | ((a & 31) >> 1) | ((a & 1) << 4);
}

// ---- IP / IP⁻¹ / F / crypt ----
function _initial_permutation(data: Uint8Array): [number, number] {
  const s0 = (_bitnum(data,57,31)|_bitnum(data,49,30)|_bitnum(data,41,29)|_bitnum(data,33,28)|
    _bitnum(data,25,27)|_bitnum(data,17,26)|_bitnum(data,9,25)|_bitnum(data,1,24)|
    _bitnum(data,59,23)|_bitnum(data,51,22)|_bitnum(data,43,21)|_bitnum(data,35,20)|
    _bitnum(data,27,19)|_bitnum(data,19,18)|_bitnum(data,11,17)|_bitnum(data,3,16)|
    _bitnum(data,61,15)|_bitnum(data,53,14)|_bitnum(data,45,13)|_bitnum(data,37,12)|
    _bitnum(data,29,11)|_bitnum(data,21,10)|_bitnum(data,13,9)|_bitnum(data,5,8)|
    _bitnum(data,63,7)|_bitnum(data,55,6)|_bitnum(data,47,5)|_bitnum(data,39,4)|
    _bitnum(data,31,3)|_bitnum(data,23,2)|_bitnum(data,15,1)|_bitnum(data,7,0)) >>> 0;
  const s1 = (_bitnum(data,56,31)|_bitnum(data,48,30)|_bitnum(data,40,29)|_bitnum(data,32,28)|
    _bitnum(data,24,27)|_bitnum(data,16,26)|_bitnum(data,8,25)|_bitnum(data,0,24)|
    _bitnum(data,58,23)|_bitnum(data,50,22)|_bitnum(data,42,21)|_bitnum(data,34,20)|
    _bitnum(data,26,19)|_bitnum(data,18,18)|_bitnum(data,10,17)|_bitnum(data,2,16)|
    _bitnum(data,60,15)|_bitnum(data,52,14)|_bitnum(data,44,13)|_bitnum(data,36,12)|
    _bitnum(data,28,11)|_bitnum(data,20,10)|_bitnum(data,12,9)|_bitnum(data,4,8)|
    _bitnum(data,62,7)|_bitnum(data,54,6)|_bitnum(data,46,5)|_bitnum(data,38,4)|
    _bitnum(data,30,3)|_bitnum(data,22,2)|_bitnum(data,14,1)|_bitnum(data,6,0)) >>> 0;
  return [s0, s1];
}

function _inverse_permutation(s0: number, s1: number): Uint8Array {
  const d = new Uint8Array(8);
  d[3]=_bitnum_intr(s1,7,7)|_bitnum_intr(s0,7,6)|_bitnum_intr(s1,15,5)|_bitnum_intr(s0,15,4)|_bitnum_intr(s1,23,3)|_bitnum_intr(s0,23,2)|_bitnum_intr(s1,31,1)|_bitnum_intr(s0,31,0);
  d[2]=_bitnum_intr(s1,6,7)|_bitnum_intr(s0,6,6)|_bitnum_intr(s1,14,5)|_bitnum_intr(s0,14,4)|_bitnum_intr(s1,22,3)|_bitnum_intr(s0,22,2)|_bitnum_intr(s1,30,1)|_bitnum_intr(s0,30,0);
  d[1]=_bitnum_intr(s1,5,7)|_bitnum_intr(s0,5,6)|_bitnum_intr(s1,13,5)|_bitnum_intr(s0,13,4)|_bitnum_intr(s1,21,3)|_bitnum_intr(s0,21,2)|_bitnum_intr(s1,29,1)|_bitnum_intr(s0,29,0);
  d[0]=_bitnum_intr(s1,4,7)|_bitnum_intr(s0,4,6)|_bitnum_intr(s1,12,5)|_bitnum_intr(s0,12,4)|_bitnum_intr(s1,20,3)|_bitnum_intr(s0,20,2)|_bitnum_intr(s1,28,1)|_bitnum_intr(s0,28,0);
  d[7]=_bitnum_intr(s1,3,7)|_bitnum_intr(s0,3,6)|_bitnum_intr(s1,11,5)|_bitnum_intr(s0,11,4)|_bitnum_intr(s1,19,3)|_bitnum_intr(s0,19,2)|_bitnum_intr(s1,27,1)|_bitnum_intr(s0,27,0);
  d[6]=_bitnum_intr(s1,2,7)|_bitnum_intr(s0,2,6)|_bitnum_intr(s1,10,5)|_bitnum_intr(s0,10,4)|_bitnum_intr(s1,18,3)|_bitnum_intr(s0,18,2)|_bitnum_intr(s1,26,1)|_bitnum_intr(s0,26,0);
  d[5]=_bitnum_intr(s1,1,7)|_bitnum_intr(s0,1,6)|_bitnum_intr(s1,9,5)|_bitnum_intr(s0,9,4)|_bitnum_intr(s1,17,3)|_bitnum_intr(s0,17,2)|_bitnum_intr(s1,25,1)|_bitnum_intr(s0,25,0);
  d[4]=_bitnum_intr(s1,0,7)|_bitnum_intr(s0,0,6)|_bitnum_intr(s1,8,5)|_bitnum_intr(s0,8,4)|_bitnum_intr(s1,16,3)|_bitnum_intr(s0,16,2)|_bitnum_intr(s1,24,1)|_bitnum_intr(s0,24,0);
  return d;
}

function _f(state: number, key: number[]): number {
  const t1 = (_bitnum_intl(state,31,0)|((state&0xf0000000)>>>1)|_bitnum_intl(state,4,5)|
    _bitnum_intl(state,3,6)|((state&0x0f000000)>>>3)|_bitnum_intl(state,8,11)|
    _bitnum_intl(state,7,12)|((state&0x00f00000)>>>5)|_bitnum_intl(state,12,17)|
    _bitnum_intl(state,11,18)|((state&0x000f0000)>>>7)|_bitnum_intl(state,16,23))>>>0;
  const t2 = (_bitnum_intl(state,15,0)|((state&0x0000f000)<<15)|_bitnum_intl(state,20,5)|
    _bitnum_intl(state,19,6)|((state&0x00000f00)<<13)|_bitnum_intl(state,24,11)|
    _bitnum_intl(state,23,12)|((state&0x000000f0)<<11)|_bitnum_intl(state,28,17)|
    _bitnum_intl(state,27,18)|((state&0x0000000f)<<9)|_bitnum_intl(state,0,23))>>>0;
  const lrg = [((t1>>>24)&0xff)^key[0],((t1>>>16)&0xff)^key[1],((t1>>>8)&0xff)^key[2],
    ((t2>>>24)&0xff)^key[3],((t2>>>16)&0xff)^key[4],((t2>>>8)&0xff)^key[5]];
  const st = ((sbox[0][_sbox_bit(lrg[0]>>2)]<<28)|(sbox[1][_sbox_bit(((lrg[0]&3)<<4)|(lrg[1]>>4))]<<24)|
    (sbox[2][_sbox_bit(((lrg[1]&15)<<2)|(lrg[2]>>6))]<<20)|(sbox[3][_sbox_bit(lrg[2]&63)]<<16)|
    (sbox[4][_sbox_bit(lrg[3]>>2)]<<12)|(sbox[5][_sbox_bit(((lrg[3]&3)<<4)|(lrg[4]>>4))]<<8)|
    (sbox[6][_sbox_bit(((lrg[4]&15)<<2)|(lrg[5]>>6))]<<4)|sbox[7][_sbox_bit(lrg[5]&63)]);
  return (_bitnum_intl(st,15,0)|_bitnum_intl(st,6,1)|_bitnum_intl(st,19,2)|
    _bitnum_intl(st,20,3)|_bitnum_intl(st,28,4)|_bitnum_intl(st,11,5)|
    _bitnum_intl(st,27,6)|_bitnum_intl(st,16,7)|_bitnum_intl(st,0,8)|
    _bitnum_intl(st,14,9)|_bitnum_intl(st,22,10)|_bitnum_intl(st,25,11)|
    _bitnum_intl(st,4,12)|_bitnum_intl(st,17,13)|_bitnum_intl(st,30,14)|
    _bitnum_intl(st,9,15)|_bitnum_intl(st,1,16)|_bitnum_intl(st,7,17)|
    _bitnum_intl(st,23,18)|_bitnum_intl(st,13,19)|_bitnum_intl(st,31,20)|
    _bitnum_intl(st,26,21)|_bitnum_intl(st,2,22)|_bitnum_intl(st,8,23)|
    _bitnum_intl(st,18,24)|_bitnum_intl(st,12,25)|_bitnum_intl(st,29,26)|
    _bitnum_intl(st,5,27)|_bitnum_intl(st,21,28)|_bitnum_intl(st,10,29)|
    _bitnum_intl(st,3,30)|_bitnum_intl(st,24,31))>>>0;
}

function _crypt(data: Uint8Array, key: number[][]): Uint8Array {
  let [s0, s1] = _initial_permutation(data);
  for (let i=0; i<15; i++) { const t=s1; s1=(_f(s1,key[i])^s0)>>>0; s0=t; }
  s0 = (_f(s1,key[15])^s0)>>>0;
  return _inverse_permutation(s0, s1);
}

// ---- Python _key_schedule (含非标准 perm_d!) ----
function _key_schedule(kb: Uint8Array, mode: number): number[][] {
  const sch: number[][] = Array.from({length:16},()=>[0,0,0,0,0,0]);
  const shift=[1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
  const pc=[56,48,40,32,24,16,8,0,57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35];
  // ★ QQ 非标准 perm_d！末尾 4 值为 27,19,11,3 而非标准 DES 的 59,51,43,35 ★
  const pd=[62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,60,52,44,36,28,20,12,4,27,19,11,3];
  const cp=[13,16,10,23,0,4,2,27,14,5,20,9,22,18,11,3,25,7,15,6,26,19,12,1,40,51,30,36,46,54,29,39,50,44,32,47,43,48,38,55,33,52,45,41,49,35,28,31];
  let c=0; for (let i=0;i<28;i++) c|=_bitnum(kb,pc[i],31-i); c>>>=0;
  let d=0; for (let i=0;i<28;i++) d|=_bitnum(kb,pd[i],31-i); d>>>=0;
  for (let i=0;i<16;i++) {
    c=((c<<shift[i])|(c>>>(28-shift[i])))&0xfffffff0;
    d=((d<<shift[i])|(d>>>(28-shift[i])))&0xfffffff0;
    const tg=mode===DECRYPT?15-i:i;
    for (let j=0;j<6;j++) sch[tg][j]=0;
    for (let j=0;j<24;j++) sch[tg][Math.floor(j/8)]|=_bitnum_intr(c,cp[j],7-(j%8));
    for (let j=24;j<48;j++) sch[tg][Math.floor(j/8)]|=_bitnum_intr(d,cp[j]-27,7-(j%8));
  }
  return sch;
}

const _tdes=new Map<string,number[][][]>();
function tripledes_key_setup(key: Uint8Array, mode: number): number[][][] {
  const ck=`${Array.from(key).join(",")}_${mode}`;
  if(_tdes.has(ck)) return _tdes.get(ck)!;
  let r: number[][][];
  if(mode===ENCRYPT) r=[_key_schedule(key.slice(0),1),_key_schedule(key.slice(8),0),_key_schedule(key.slice(16),1)];
  else r=[_key_schedule(key.slice(16),0),_key_schedule(key.slice(8),1),_key_schedule(key.slice(0),0)];
  _tdes.set(ck,r); return r;
}
function tripledes_crypt(data: Uint8Array, key: number[][][]): Uint8Array {
  let r=data; for(let i=0;i<3;i++) r=_crypt(r,key[i]); return r;
}

// ---- 去除 PKCS7 填充 ----
function stripPkcs7(data: Uint8Array): Uint8Array {
  if (data.length===0) return data;
  const pl=data[data.length-1];
  if (pl>=1&&pl<=8) {
    let ok=true;
    for (let i=data.length-pl;i<data.length;i++) if(data[i]!==pl){ok=false;break;}
    if(ok) return data.slice(0,data.length-pl);
  }
  return data;
}

// ---- qrcDecrypt ----
export async function qrcDecrypt(encryptedQrc: string): Promise<string> {
  if (!encryptedQrc) return "";
  try {
    const len=Math.floor(encryptedQrc.length/2);
    if(len===0) return "";
    const data=new Uint8Array(len);
    for(let i=0;i<len;i++) data[i]=parseInt(encryptedQrc.substr(i*2,2),16);

    const schedule=tripledes_key_setup(QRC_KEY_BYTES, DECRYPT);
    const result=new Uint8Array(data.length);
    for(let i=0;i<data.length;i+=8) {
      result.set(tripledes_crypt(data.slice(i,i+8), schedule), i);
    }

    const unpadded=stripPkcs7(result);
    const decompressed=await zlibDecompress(unpadded);
    if(decompressed!==null) return decompressed;
    const txt=new TextDecoder("utf-8").decode(unpadded);
    return txt.length>10&&/[\[\(\{\}\]\)\<\>]/.test(txt)?txt:"";
  } catch { return ""; }
}

// ============================================================
// 酷狗 KRC: XOR 解密
// ============================================================

const KRC_KEY = new Uint8Array([
  0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47,
  0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69,
]);

/**
 * 酷狗 KRC 歌词解密
 * 跳过前 4 字节 → XOR 循环 → zlib 解压 → UTF-8
 */
export async function krcDecrypt(encrypted: Uint8Array): Promise<string> {
  // 跳过前 4 字节
  const data = encrypted.slice(4);
  const decrypted = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    decrypted[i] = data[i] ^ KRC_KEY[i % KRC_KEY.length];
  }

  const decompressed = await zlibDecompress(decrypted);
  if (decompressed !== null) {
    return decompressed;
  }
  return new TextDecoder("utf-8").decode(decrypted);
}
