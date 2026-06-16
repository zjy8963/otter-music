// ============================================================
// 歌词解析器 — 移植自 LDDC 项目 (GPL-3.0)
// YRC/QRC/KRC → 结构化逐字歌词数据
// ============================================================

import type { LyricLine, LyricWord, LyricData } from "./types";

// ============================================================
// YRC 解析器 (网易云逐字歌词)
// ============================================================

/** YRC 行格式: [start_ms, duration_ms]word_data... */
const YRC_LINE_RE = /^\[(\d+),(\d+)\](.*)$/;
/** YRC 逐字格式: (start,duration,0)text */
const YRC_WORD_RE = /(?:\[\d+,\d+\])?\((\d+),(\d+),\d+\)([^()]*)/g;
/** YRC JSON 行格式: {"t": ms, "c": [...]} */
const YRC_JSON_LINE_RE = /^\{"t":(\d+),"c":\[(.*)\]$/;

export function parseYrc(yrcText: string): { orig: LyricLine[]; tags: Record<string, string> } {
  const lines: LyricLine[] = [];
  const tags: Record<string, string> = {};

  for (const rawLine of yrcText.trim().split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    // 尝试 YRC 行格式: [start_ms, duration_ms]word_data...
    let m = YRC_LINE_RE.exec(line);
    if (m) {
      const lineStart = parseInt(m[1], 10);
      const lineDuration = parseInt(m[2], 10);
      const lineContent = m[3];

      const words: LyricWord[] = [];
      let wm: RegExpExecArray | null;
      // 重置 lastIndex（因为使用了 g flag）
      YRC_WORD_RE.lastIndex = 0;
      while ((wm = YRC_WORD_RE.exec(lineContent)) !== null) {
        const wStart = parseInt(wm[1], 10);
        const wDuration = parseInt(wm[2], 10);
        const wText = wm[3];
        if (wText) {
          // YRC 字偏移是绝对时间（不加 line_start）
          words.push({
            start: wStart,
            end: wStart + wDuration,
            text: wText,
          });
        }
      }

      if (words.length === 0) {
        words.push({
          start: lineStart,
          end: lineStart + lineDuration,
          text: lineContent,
        });
      }

      lines.push({
        start: lineStart,
        end: lineStart + lineDuration,
        words,
      });
      continue;
    }

    // JSON 行格式 (网易云新版 YRC 混合格式): {"t": ms, "c": [...]}
    m = YRC_JSON_LINE_RE.exec(line);
    if (m) {
      const tMs = parseInt(m[1], 10);
      try {
        const cArr: { tx?: string }[] = JSON.parse(`[${m[2]}]`);
        const words: LyricWord[] = [];
        for (const item of cArr) {
          if (typeof item === "object" && item.tx) {
            words.push({ start: tMs, end: tMs + 1000, text: item.tx });
          }
        }
        lines.push({
          start: tMs,
          end: tMs + 1000,
          words,
        });
      } catch {
        // JSON 解析失败，跳过
      }
      continue;
    }

    // LRC 标签行: [ti:xxx], [ar:xxx] (key 部分不含纯数字)
    if (line.startsWith("[") && line.includes(":")) {
      const keyPart = line.slice(1).split(":", 1)[0];
      if (!/^[\d.]+$/.test(keyPart)) {
        const tagMatch = /^\[(\w+):(.*)\]$/.exec(line);
        if (tagMatch) {
          tags[tagMatch[1]] = tagMatch[2].trim();
        }
        continue;
      }
    }

    // 纯 LRC 行: [mm:ss.xx]text
    const lrcMatch = /^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/.exec(line);
    if (lrcMatch) {
      const mins = parseInt(lrcMatch[1], 10);
      const secs = parseFloat(lrcMatch[2]);
      const startMs = Math.round((mins * 60 + secs) * 1000);
      const text = lrcMatch[3].trim();
      lines.push({
        start: startMs,
        end: startMs + 2000,
        words: [{ start: startMs, end: startMs + 2000, text }],
      });
    }
  }

  return { orig: lines, tags };
}

// ============================================================
// QRC 解析器 (QQ音乐逐字歌词)
// ============================================================

/** 提取 QRC XML 中的 LyricContent */
const QRC_XML_RE = /<Lyric_1 LyricType="1" LyricContent="(.*?)"\/>/s;
/** QRC 标签: [key:value] */
const QRC_TAG_RE = /^\[(\w+):([^\]]*)\]$/;
/** QRC 行格式: [start_ms, duration_ms]word_data... */
const QRC_LINE_RE = /^\[(\d+),(\d+)\](.*)$/;
/** QRC 逐字格式: text(start,duration) — 注意与 YRC 不同！ */
const QRC_WORD_RE = /(?:\[\d+,\d+\])?([^()]*?)\((\d+),(\d+)\)/g;

export function parseQrc(qrcXml: string): { orig: LyricLine[]; tags: Record<string, string> } {
  const xm = QRC_XML_RE.exec(qrcXml);
  if (!xm || !xm[1]) {
    return { orig: [], tags: {} };
  }

  const content = xm[1];
  const lines: LyricLine[] = [];
  const tags: Record<string, string> = {};

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const lm = QRC_LINE_RE.exec(line);
    if (lm) {
      const lineStart = parseInt(lm[1], 10);
      const lineDuration = parseInt(lm[2], 10);
      const lineContent = lm[3];

      // 空行（只有时间戳，内容是 (start,duration) 格式）
      if (lineContent.startsWith("(") && lineContent.endsWith(")") && /^\(\d+,\d+\)$/.test(lineContent)) {
        lines.push({
          start: lineStart,
          end: lineStart + lineDuration,
          words: [],
        });
        continue;
      }

      const words: LyricWord[] = [];
      QRC_WORD_RE.lastIndex = 0;
      let wm: RegExpExecArray | null;
      while ((wm = QRC_WORD_RE.exec(lineContent)) !== null) {
        const wText = wm[1];
        const wStart = parseInt(wm[2], 10);
        const wDuration = parseInt(wm[3], 10);
        if (wText && wText !== "\r") {
          // QRC 字偏移是绝对时间（不加 line_start）
          words.push({
            start: wStart,
            end: wStart + wDuration,
            text: wText,
          });
        }
      }

      if (words.length === 0) {
        words.push({
          start: lineStart,
          end: lineStart + lineDuration,
          text: lineContent,
        });
      }

      lines.push({
        start: lineStart,
        end: lineStart + lineDuration,
        words,
      });
    } else {
      // 标签行
      const tagMatch = QRC_TAG_RE.exec(line);
      if (tagMatch) {
        tags[tagMatch[1]] = tagMatch[2];
      }
    }
  }

  return { orig: lines, tags };
}

// ============================================================
// KRC 解析器 (酷狗逐字歌词)
// ============================================================

/** KRC 标签: [key:value] */
const KRC_TAG_RE = /^\[(\w+):([^\]]*)\]$/;
/** KRC 行格式: [start_ms, duration_ms]word_data... */
const KRC_LINE_RE = /^\[(\d+),(\d+)\](.*)$/;
/** KRC 逐字格式: <start,duration,0>text */
const KRC_WORD_RE = /(?:\[\d+,\d+\])?<(\d+),(\d+),\d+>([^<]*)/g;

export function parseKrc(krcText: string): {
  orig: LyricLine[];
  ts?: LyricLine[];
  roma?: LyricLine[];
  tags: Record<string, string>;
} {
  const lines: LyricLine[] = [];
  const tags: Record<string, string> = {};
  let langData: { content?: { type?: number; lyricContent?: string[][] }[] } | null = null;

  for (const rawLine of krcText.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    // 标签行
    const tm = KRC_TAG_RE.exec(line);
    if (tm) {
      const key = tm[1];
      const val = tm[2];
      tags[key] = val;
      if (key === "language") {
        try {
          const decoded = atob(val.trim());
          langData = JSON.parse(decoded);
        } catch {
          // base64 解码或 JSON 解析失败
        }
      }
      continue;
    }

    // 歌词行
    const lm = KRC_LINE_RE.exec(line);
    if (lm) {
      const lineStart = parseInt(lm[1], 10);
      const lineDuration = parseInt(lm[2], 10);
      const lineContent = lm[3];

      const words: LyricWord[] = [];
      KRC_WORD_RE.lastIndex = 0;
      let wm: RegExpExecArray | null;
      while ((wm = KRC_WORD_RE.exec(lineContent)) !== null) {
        const wStart = parseInt(wm[1], 10);
        const wDuration = parseInt(wm[2], 10);
        const wText = wm[3];
        if (wText) {
          // KRC 字偏移须加上行起始时间
          words.push({
            start: lineStart + wStart,
            end: lineStart + wStart + wDuration,
            text: wText,
          });
        }
      }

      if (words.length === 0) {
        words.push({
          start: lineStart,
          end: lineStart + lineDuration,
          text: lineContent,
        });
      }

      lines.push({
        start: lineStart,
        end: lineStart + lineDuration,
        words,
      });
    }
  }

  const result: ReturnType<typeof parseKrc> = { orig: lines, tags };

  // 从 language 字段提取翻译和罗马音
  if (langData?.content) {
    const langs = langData.content;

    for (const lang of langs) {
      const ltype = lang.type;
      const lcontent = lang.lyricContent || [];

      if (ltype === 0) {
        // 罗马音（逐字）
        const romaLines: LyricLine[] = [];
        let offset = 0;
        for (let i = 0; i < lines.length; i++) {
          const origLine = lines[i];
          // 跳过空行（所有字都为空的行）
          if (origLine.words.every((w) => !w.text)) {
            offset++;
            continue;
          }
          const idx = i - offset;
          if (idx < lcontent.length) {
            const romaWords: LyricWord[] = [];
            for (let j = 0; j < origLine.words.length; j++) {
              if (j < lcontent[idx].length) {
                romaWords.push({
                  start: origLine.words[j].start,
                  end: origLine.words[j].end,
                  text: lcontent[idx][j],
                });
              }
            }
            if (romaWords.length > 0) {
              romaLines.push({
                start: origLine.start,
                end: origLine.end,
                words: romaWords,
              });
            }
          }
        }
        if (romaLines.length > 0) {
          result.roma = romaLines;
        }
      } else if (ltype === 1) {
        // 翻译（逐行）
        const tsLines: LyricLine[] = [];
        for (let i = 0; i < lines.length; i++) {
          if (i < lcontent.length) {
            const text = lcontent[i][0] || "";
            tsLines.push({
              start: lines[i].start,
              end: lines[i].end,
              words: [{ start: lines[i].start, end: lines[i].end, text }],
            });
          }
        }
        if (tsLines.length > 0) {
          result.ts = tsLines;
        }
      }
    }
  }

  return result;
}

// ============================================================
// 结构化数据 → LRC 文本转换
// ============================================================

/**
 * 将结构化歌词数据转换回 LRC 文本
 * 格式: [mm:ss.xx]text
 */
export function dataToLrc(data: LyricLine[]): string {
  const lrcLines: string[] = [];
  for (const line of data) {
    const startMs = line.start || 0;
    const m = Math.floor(startMs / 60000);
    const s = (startMs % 60000) / 1000;
    const timestamp = `[${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}]`;
    const text = line.words.map((w) => w.text).join("");
    lrcLines.push(`${timestamp}${text}`);
  }
  return lrcLines.join("\n");
}
