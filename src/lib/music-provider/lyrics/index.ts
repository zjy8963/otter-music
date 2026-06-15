// ============================================================
// 歌词模块 — 统一入口
//
// 导出各平台的歌词获取函数和解析/加密工具
// 供 factory.ts 的 PlatformProvider 使用
// ============================================================

export { fetchNeteaseLyric } from "./netease";
export { fetchQqLyric } from "./qq";
export { fetchKugouLyric } from "./kugou";
export { fetchKuwoLyric } from "./kuwo";

export { parseYrc, parseQrc, parseKrc, dataToLrc } from "./parsers";
export {
  encryptEapiParams,
  qrcDecrypt,
  krcDecrypt,
  zlibDecompress,
  md5Hex,
} from "./crypto";

export type { LyricWord, LyricLine, LyricData } from "./types";
