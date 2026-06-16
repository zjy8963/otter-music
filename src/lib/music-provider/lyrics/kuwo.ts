// ============================================================
// 酷我音乐歌词获取器
//
// 通过酷我官方新版歌词 API 获取逐字歌词 (lrcx 格式):
//   1. 构建请求参数 → XOR 加密 (key="yeelion") → Base64
//   2. GET http://newlyric.kuwo.cn/newlyric.lrc?{encryptedParams}
//   3. 响应: "tp=content\r\n\r\n" + zlib 压缩数据
//   4. zlib 解压 → Base64 解码 → XOR 解密 → GB18030 解码
//   5. 逐字格式转换 → 结构化 LyricLine[]
//
// 返回 SongLyric (含 orig/ts 结构化逐字数据)
// ============================================================

import type { MusicTrack, SongLyric, LyricWord, LyricLine } from "@otter-music/shared";
import { IS_NATIVE } from "@/lib/api/config";
import { inflate } from "pako";
import { logger } from "@/lib/logger";

// ============================================================
// 常量
// ============================================================

const KUWO_LYRIC_API = "http://newlyric.kuwo.cn/newlyric.lrc";
const KUWO_XOR_KEY = "yeelion";

// ============================================================
// ID 提取
// ============================================================

/** 从 MusicTrack 提取酷我歌曲数字 ID */
function extractKuwoId(track: MusicTrack): string {
  const raw = track.lyric_id || track.url_id || track.id;
  return raw.replace(/^(kuwo_|kw_)/, "");
}

// ============================================================
// 请求参数构建与加密
// ============================================================

function xorEncryptToBase64(text: string, key: string): string {
  const textBytes = new TextEncoder().encode(text);
  const keyBytes = new TextEncoder().encode(key);
  const output = new Uint8Array(textBytes.length);
  for (let i = 0; i < textBytes.length; i++) {
    output[i] = textBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  let binary = "";
  for (let i = 0; i < output.length; i++) {
    binary += String.fromCharCode(output[i]);
  }
  return btoa(binary);
}

function buildKuwoLyricParams(songId: string): string {
  return `user=12345,web,web,web&requester=localhost&req=1&rid=MUSIC_${songId}&lrcx=1`;
}

// ============================================================
// HTTP 请求
// ============================================================

async function fetchKuwoLyricRaw(
  url: string,
  signal?: AbortSignal
): Promise<Uint8Array | null> {
  try {
    if (IS_NATIVE) {
      const res = await fetch(url, {
        signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36",
        },
      });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    } else {
      const proxyUrl = `/proxy?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl, { signal });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    }
  } catch {
    return null;
  }
}

// ============================================================
// 响应解密
// ============================================================

function decodeGB18030(data: Uint8Array): string {
  try { return new TextDecoder("gb18030").decode(data); }
  catch { try { return new TextDecoder("gbk").decode(data); }
    catch { return new TextDecoder("utf-8").decode(data); } }
}

async function decodeKuwoLyricResponse(data: Uint8Array): Promise<string | null> {
  try {
    const headerEnd = 10;
    let bodyStart = -1;
    for (let i = headerEnd; i < data.length - 3; i++) {
      if (data[i] === 0x0d && data[i+1] === 0x0a && data[i+2] === 0x0d && data[i+3] === 0x0a) {
        bodyStart = i + 4; break;
      }
    }
    if (bodyStart === -1) { logger.info("kuwo-lyric", "Invalid response: no tp=content separator"); return null; }

    const compressedData = data.slice(bodyStart);
    let decompressed: string;
    try { decompressed = inflate(compressedData, { to: "string" }) as string; }
    catch {
      try { decompressed = inflate(compressedData, { to: "string", raw: true }) as string; }
      catch (e2) { logger.info("kuwo-lyric", "Decompress failed: " + e2); return null; }
    }

    if (!decompressed) { logger.info("kuwo-lyric", "Empty decompressed data"); return null; }

    let encrypted: Uint8Array;
    try { encrypted = Uint8Array.from(atob(decompressed), (c) => c.charCodeAt(0)); }
    catch { logger.info("kuwo-lyric", "Base64 decode failed"); return null; }

    const keyBytes = new TextEncoder().encode(KUWO_XOR_KEY);
    const decrypted = new Uint8Array(encrypted.length);
    for (let i = 0; i < encrypted.length; i++) decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];

    return decodeGB18030(decrypted);
  } catch (e) { logger.info("kuwo-lyric", `Decode error: ${e}`); return null; }
}

// ============================================================
// 逐字格式转换: 酷我格式 → 结构化 LyricLine[]
// ============================================================

function formatLrcTime(ms: number): string {
  if (isNaN(ms) || ms < 0) ms = 0;
  const m = Math.floor(ms / 60000);
  const s = (ms % 60000) / 1000;
  return `[${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}]`;
}

const KW_LINE_TIME_RE = /^\[(\d{2}):(\d{2})\.(\d{3})\](.*)$/;
const TRANSLATION_RE = /[\u4e00-\u9fa5]/;

interface KuwoLrcResult {
  orig: LyricLine[];
  ts: LyricLine[];
  lyric: string;
  tlyric?: string;
}

function convertKuwoLrc(rawLrc: string): KuwoLrcResult {
  const lines = rawLrc.split(/\r\n|\r|\n/);

  // 解析 [kuwo:OCTAL] 标签
  let kuwoOffset = 1;
  let kuwoOffset2 = 1;
  const kuwoTagMatch = rawLrc.match(/\[kuwo:(\d+)\]/);
  if (kuwoTagMatch) {
    const kuwoValue = parseInt(kuwoTagMatch[1], 8);
    kuwoOffset = Math.trunc(kuwoValue / 10);
    kuwoOffset2 = kuwoValue % 10;
    if (kuwoOffset === 0 || kuwoOffset2 === 0) { kuwoOffset = 1; kuwoOffset2 = 1; }
  }

  const origLines: LyricLine[] = [];
  const tsLines: LyricLine[] = [];
  const lyricText: string[] = [];
  const tlyricText: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(KW_LINE_TIME_RE);
    if (!match) continue;

    const [, minStr, secStr, msStr, content] = match;
    const lineStartMs = parseInt(minStr, 10) * 60000 + parseInt(secStr, 10) * 1000 + parseInt(msStr, 10);
    let isTranslation = false;
    if (content.replace(/<0,0>/g, "").trim() !== "") {
      isTranslation = /^<0,0>/.test(content) && TRANSLATION_RE.test(content);
    } else {
      // 空行：无文本内容，仅保留时间戳
      origLines.push({ start: lineStartMs, end: lineStartMs + 2000,
        words: [{ start: lineStartMs, end: lineStartMs + 2000, text: "" }] });
      lyricText.push(`${formatLrcTime(lineStartMs)}`);
      continue;
    }

    if (isTranslation) {
      const text = content.replace(/<[^>]*>/g, "").trim();
      tlyricText.push(`${formatLrcTime(lineStartMs)}${text}`);
      tsLines.push({ start: lineStartMs, end: lineStartMs + 2000, words: [{ start: lineStartMs, end: lineStartMs + 2000, text }] });
    } else {
      // 从逐字标签 <offset,offset2>text 提取结构化单词
      // 参考实现: offset+offset2 得字开始偏移, offset-offset2 得字时长, 除以 kuwoOffset/kuwoOffset2 转为 ms
      const wordRegex = /<(-?\d+),(-?\d+)>([^<]*)/g;
      const words: LyricWord[] = [];
      let wm: RegExpExecArray | null;
      while ((wm = wordRegex.exec(content)) !== null) {
        const wOffset = parseInt(wm[1], 10);
        const wOffset2 = parseInt(wm[2], 10);
        const wText = wm[3];
        if (wText) {
          const wStartOffset = Math.abs((wOffset + wOffset2) / (kuwoOffset * 2));
          const wDuration = Math.abs((wOffset - wOffset2) / (kuwoOffset2 * 2));
          const absStart = lineStartMs + wStartOffset;
          const absEnd = absStart + (wDuration > 0 ? wDuration : 1);
          words.push({ start: absStart, end: absEnd, text: wText });
        }
      }
      // 传播字间时间（填充无持续时间的字）
      for (let j = 0; j < words.length - 1; j++) {
        if (!words[j].end || words[j].end <= words[j].start) words[j].end = words[j + 1].start;
      }
      const last = words[words.length - 1];
      const lineEndMs = last ? (last.end > last.start ? last.end : lineStartMs + 2000) : lineStartMs + 2000;

      const text = content.replace(/<[^>]*>/g, "").trim();
      lyricText.push(`${formatLrcTime(lineStartMs)}${text}`);
      origLines.push({ start: lineStartMs, end: lineEndMs, words: words.length > 0 ? words : [{ start: lineStartMs, end: lineEndMs, text }] });

      // 下一行翻译
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const nextMatch = nextLine.match(KW_LINE_TIME_RE);
        if (nextMatch && /^<0,0>/.test(nextMatch[4]) && TRANSLATION_RE.test(nextMatch[4])) {
          const ttext = nextMatch[4].replace(/<[^>]*>/g, "").trim();
          tlyricText.push(`${formatLrcTime(lineStartMs)}${ttext}`);
          tsLines.push({ start: lineStartMs, end: lineEndMs, words: [{ start: lineStartMs, end: lineEndMs, text: ttext }] });
          i++;
        }
      }
    }
  }

  return { orig: origLines, ts: tsLines, lyric: lyricText.join("\n"), tlyric: tlyricText.length > 0 ? tlyricText.join("\n") : undefined };
}

// ============================================================
// 主入口
// ============================================================

export async function fetchKuwoLyric(
  track: MusicTrack,
  signal?: AbortSignal
): Promise<SongLyric | null> {
  try {
    const songId = extractKuwoId(track);
    if (!songId) { logger.info("kuwo-lyric", "No song ID"); return null; }

    const params = buildKuwoLyricParams(songId);
    const encryptedParams = xorEncryptToBase64(params, KUWO_XOR_KEY);
    const url = `${KUWO_LYRIC_API}?${encryptedParams}`;
    logger.info("kuwo-lyric", `Fetching lyrics for songId=${songId}`);

    const rawBytes = await fetchKuwoLyricRaw(url, signal);
    if (!rawBytes) { logger.info("kuwo-lyric", "No response data"); return null; }

    const lrcText = await decodeKuwoLyricResponse(rawBytes);
    if (!lrcText) { logger.info("kuwo-lyric", "Failed to decode response"); return null; }

    const result = convertKuwoLrc(lrcText);
    if (!result.lyric) { logger.info("kuwo-lyric", "No lyric content after conversion"); return null; }

    const lc = result.lyric.split("\n").filter((l) => l.trim()).length;
    const tc = result.tlyric ? result.tlyric.split("\n").filter((l) => l.trim()).length : 0;
    logger.info("kuwo-lyric", `Success: ${lc} lines${tc ? `, ${tc} translation` : ""}`);

    return {
      lyric: result.lyric,
      tlyric: result.tlyric,
      orig: result.orig.length > 0 ? result.orig : undefined,
      ts: result.ts.length > 0 ? result.ts : undefined,
    };
  } catch (e) { logger.info("kuwo-lyric", `Failed: ${e}`); return null; }
}
