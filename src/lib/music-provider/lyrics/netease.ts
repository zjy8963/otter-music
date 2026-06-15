// ============================================================
// 网易云音乐歌词获取器
//
// 通过 EAPI 加密请求官方歌词接口:
//   POST https://interface3.music.163.com/eapi/song/lyric/v1
//
// Web 端走 Functions/Vite 代理 (/music-api/thirdparty)
// Native 端直连
//
// 优先使用 YRC（逐字歌词），回退到 LRC
// ============================================================

import type { MusicTrack, SongLyric } from "@otter-music/shared";
import type { LyricData } from "./types";
import { encryptEapiParams } from "./crypto";
import { parseYrc, dataToLrc } from "./parsers";
import { apiFetch } from "../internal-sources/api-proxy";
import { logger } from "@/lib/logger";

const LYRIC_URL = "https://interface3.music.163.com/eapi/song/lyric/v1";
const LYRIC_PATH = "/api/song/lyric/v1";

/**
 * 从 MusicTrack 提取网易云歌曲数字 ID
 */
function extractNeteaseId(track: MusicTrack): string {
  const raw = track.lyric_id || track.url_id || track.id;
  return raw.replace(/^(netease|netrack_|ne_track_)/, "");
}

/**
 * 获取网易云歌词
 * 返回 SongLyric (兼容现有接口)
 */
export async function fetchNeteaseLyric(
  track: MusicTrack,
  signal?: AbortSignal
): Promise<SongLyric | null> {
  try {
    const songId = extractNeteaseId(track);
    if (!songId || isNaN(Number(songId))) {
      logger.info("netease-lyric", `Invalid song ID: ${songId}`);
      return null;
    }

    // EAPI 加密（与 shared/src/utils/music/netease-crypto.ts 一致）
    const params = encryptEapiParams(LYRIC_PATH, {
      id: parseInt(songId, 10),
      lv: -1,
      tv: -1,
      rv: -1,
      yv: -1,
    });

    // apiFetch 自动处理平台差异：
    // - Web: proxyFetch → POST /music-api/thirdparty
    // - Native: directFetch → 直连
    const data = await apiFetch(
      LYRIC_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cookie": "os=pc; appver=2.9.7; mode=31",
          "Referer": "https://music.163.com/",
        },
        body: new URLSearchParams({ params }),
      },
      signal
    );

    if (!data || data.code !== 200) {
      logger.info("netease-lyric", `API error: code=${data?.code}`);
      return null;
    }

    const result: LyricData = {
      orig: [],
      tags: {},
      lyric: "",
    };

    // 标签（上传者/翻译者）
    if (data.lyricUser?.nickname) {
      result.tags["by"] = data.lyricUser.nickname;
    }
    if (data.transUser?.nickname) {
      if (result.tags["by"] && result.tags["by"] !== data.transUser.nickname) {
        result.tags["by"] += " & " + data.transUser.nickname;
      } else {
        result.tags["by"] = data.transUser.nickname;
      }
    }

    // 逐字歌词 (YRC) — 优先
    if (data.yrc?.lyric && data.yrc.lyric.trim().length > 0) {
      const parsed = parseYrc(data.yrc.lyric);
      result.orig = parsed.orig;
      Object.assign(result.tags, parsed.tags);
      result.lyric = dataToLrc(result.orig);
    } else if (data.lrc?.lyric) {
      // 无 YRC，使用 LRC
      const txt = data.lrc.lyric.trim();
      if (txt.startsWith("{")) {
        // 混合 JSON+LRC 格式的 YRC
        const parsed = parseYrc(txt);
        result.orig = parsed.orig;
        result.lyric = dataToLrc(result.orig);
      } else {
        result.lyric = txt;
      }
    }

    // 翻译歌词 (tlyric)
    if (data.tlyric?.lyric) {
      const tlyricText = data.tlyric.lyric.trim();
      if (tlyricText) {
        result.tlyric = tlyricText;
      }
    }

    // 罗马音
    if (data.romalrc?.lyric) {
      result.roma_lrc = data.romalrc.lyric.trim();
    }

    if (!result.lyric) {
      return null;
    }

    return {
      lyric: result.lyric,
      tlyric: result.tlyric,
      orig: result.orig.length > 0 ? result.orig : undefined,
      tags: Object.keys(result.tags).length > 0 ? result.tags : undefined,
    };
  } catch (e) {
    logger.info("netease-lyric", `Failed: ${e}`);
    return null;
  }
}
