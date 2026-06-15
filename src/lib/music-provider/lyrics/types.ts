// ============================================================
// 歌词类型定义
//
// 数据结构:
//   LyricWord  = { start: ms, end: ms, text: string }       — 逐字
//   LyricLine  = { start: ms, end: ms, words: LyricWord[] } — 逐行
//   LyricData  = { orig, ts?, roma?, lyric, tlyric?, tags } — 完整歌词
// ============================================================

/** 单个字/词的时间与文本 */
export interface LyricWord {
  /** 起始时间 (ms) */
  start: number;
  /** 结束时间 (ms) */
  end: number;
  /** 文本内容 */
  text: string;
}

/** 一行歌词 */
export interface LyricLine {
  /** 行起始时间 (ms) */
  start: number;
  /** 行结束时间 (ms) */
  end: number;
  /** 该行的逐字数据 */
  words: LyricWord[];
}

/**
 * 结构化歌词完整数据
 * 兼容现有的 SongLyric { lyric: string; tlyric?: string }
 */
export interface LyricData {
  /** 逐字原文歌词 */
  orig: LyricLine[];
  /** 逐字翻译歌词 (可选) */
  ts?: LyricLine[];
  /** 逐字罗马音 (可选) */
  roma?: LyricLine[];
  /** LRC 格式原文 (向后兼容) */
  lyric: string;
  /** LRC 格式翻译 (向后兼容) */
  tlyric?: string;
  /** 罗马音纯文本 (向后兼容) */
  roma_lrc?: string;
  /** 元数据标签 (ti=歌名, ar=歌手, by=上传者 等) */
  tags: Record<string, string>;
}
