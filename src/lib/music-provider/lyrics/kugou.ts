// ============================================================
// 酷狗音乐歌词获取器
//
// 两步流程:
//   1. GET http://krcs.kugou.com/search → 获取 lyric_id + accesskey
//   2. GET http://lyrics.kugou.com/download → 获取加密 KRC
//   3. KRC 解密（XOR + zlib）→ parseKrc
//
// 返回 SongLyric (兼容现有接口)
// ============================================================

import type { MusicTrack, SongLyric } from "@otter-music/shared";
import { krcDecrypt } from "./crypto";
import { parseKrc, dataToLrc } from "./parsers";
import { apiFetch } from "../internal-sources/api-proxy";
import { logger } from "@/lib/logger";

const KRC_SEARCH_API = "http://krcs.kugou.com/search";
const KRC_DOWNLOAD_API = "http://lyrics.kugou.com/download";

/**
 * 从 MusicTrack 提取酷狗 FileHash
 * url_id 或 lyric_id 存储的是 hash
 */
function extractKgHash(track: MusicTrack): string {
  const raw = track.lyric_id || track.url_id || track.id;
  return raw.replace(/^(kg_)/, "");
}

/**
 * 获取酷狗歌词（KRC 加密逐字歌词）
 */
export async function fetchKugouLyric(
  track: MusicTrack,
  signal?: AbortSignal
): Promise<SongLyric | null> {
  try {
    const songHash = extractKgHash(track);
    if (!songHash) {
      logger.info("kugou-lyric", "No song hash");
      return null;
    }

    const artist = track.artist?.join(" - ") || "";
    const name = track.name || "";
    const keyword = artist && name ? `${artist} - ${name}` : name || "";

    // 第 1 步：krcs.kugou.com 搜索
    const searchParams = new URLSearchParams({
      ver: "1",
      man: "yes",
      client: "pc",
      hash: songHash,
      keyword: keyword || songHash,
      duration: "0",
    });

    const searchData = await apiFetch(
      `${KRC_SEARCH_API}?${searchParams}`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
      },
      signal
    );

    const candidates = searchData?.candidates || [];
    if (!candidates || candidates.length === 0) {
      return fetchKugouLrcFallback(songHash, signal);
    }

    const best = candidates[0];
    const lyricId = best.id || "";
    const accesskey = best.accesskey || "";

    if (!lyricId || !accesskey) {
      return fetchKugouLrcFallback(songHash, signal);
    }

    // 第 2 步：lyrics.kugou.com/download 下载
    const dlParams = new URLSearchParams({
      accesskey,
      charset: "utf8",
      client: "mobi",
      fmt: "krc",
      id: lyricId,
      ver: "1",
    });

    const dlData = await apiFetch(
      `${KRC_DOWNLOAD_API}?${dlParams}`,
      {
        headers: { "User-Agent": "Android14-1070-11070-201-0-Lyric-wifi" },
      },
      signal
    );

    const content = dlData?.content || "";
    if (!content) {
      return null;
    }

    // base64 解码
    const encrypted = Uint8Array.from(atob(content), (c) => c.charCodeAt(0));
    const contentType = dlData.contenttype || 0;

    if (contentType === 2) {
      // base64 编码的纯文本 LRC
      const lrc = new TextDecoder("utf-8").decode(encrypted);
      return { lyric: lrc };
    }

    // KRC 解密 → 解析逐字歌词
    const decrypted = await krcDecrypt(encrypted);
    const parsed = parseKrc(decrypted);

    return {
      lyric: dataToLrc(parsed.orig),
      tlyric: parsed.ts && parsed.ts.length > 0 ? dataToLrc(parsed.ts) : undefined,
      orig: parsed.orig.length > 0 ? parsed.orig : undefined,
      ts: parsed.ts && parsed.ts.length > 0 ? parsed.ts : undefined,
      roma: parsed.roma && parsed.roma.length > 0 ? parsed.roma : undefined,
      tags: Object.keys(parsed.tags).length > 0 ? parsed.tags : undefined,
    };
  } catch (e) {
    logger.info("kugou-lyric", `Failed: ${e}`);
    return fetchKugouLrcFallback(extractKgHash(track), signal);
  }
}

/**
 * 酷狗移动端 LRC API（无逐字歌词，无翻译）
 * 作为 KRC 失败的兜底方案
 */
async function fetchKugouLrcFallback(
  songHash: string,
  signal?: AbortSignal
): Promise<SongLyric | null> {
  try {
    const params = new URLSearchParams({
      cmd: "100",
      hash: songHash,
      timelength: "0",
      type: "1",
    });

    const data = await apiFetch(
      `http://m.kugou.com/app/i/krc.php?${params}`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
      },
      signal
    );

    // 这个 API 返回纯文本
    if (typeof data === "string") {
      const lrcText = data.trim();
      if (!lrcText || lrcText.startsWith("NO")) {
        return null;
      }
      return { lyric: lrcText };
    }

    return null;
  } catch {
    return null;
  }
}
