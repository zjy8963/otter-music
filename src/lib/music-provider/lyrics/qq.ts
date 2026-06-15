// ============================================================
// QQ 音乐歌词获取器
//
// 通过官方 API 获取加密的 QRC 逐字歌词:
//   POST https://u.y.qq.com/cgi-bin/musicu.fcg
//   module: music.musichallSong.PlayLyricInfo
//
// QRC 加密 → TripleDES 解密 → zlib 解压 → parseQrc
// ============================================================

import type { MusicTrack, SongLyric } from "@otter-music/shared";
import { qrcDecrypt } from "./crypto";
import { parseQrc, parseYrc, dataToLrc } from "./parsers";
import { apiFetch } from "../internal-sources/api-proxy";
import { logger } from "@/lib/logger";

const QQ_LYRIC_API = "https://u.y.qq.com/cgi-bin/musicu.fcg";

/**
 * UTF-8 安全 base64 编码（与 Python base64.b64encode(name.encode()).decode() 等价）
 */
function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * 从 MusicTrack 提取 QQ 歌曲标识符
 */
function extractQqId(track: MusicTrack): string {
  const raw = track.lyric_id || track.url_id || track.id;
  return raw.replace(/^(qq_)/, "");
}

/**
 * 获取 QQ 音乐歌词（QRC 加密逐字歌词）
 */
export async function fetchQqLyric(
  track: MusicTrack,
  signal?: AbortSignal
): Promise<SongLyric | null> {
  try {
    const songId = extractQqId(track);
    if (!songId) {
      logger.info("qq-lyric", "No song ID");
      return null;
    }

    // 自动检测 ID 类型
    const idParam: Record<string, string | number> =
      /^\d+$/.test(songId) ? { songID: parseInt(songId, 10) } : { songmid: songId };

    const param = {
      ...idParam,
      songName: toBase64(track.name || ""),
      singerName: toBase64(track.artist?.join(",") || ""),
      albumName: toBase64(track.album || ""),
      interval: 0,
      crypt: 1, ct: 19, cv: 2111,
      lrc_t: 0, qrc: 1, qrc_t: 0,
      roma: 1, roma_t: 0,
      trans: 1, trans_t: 0, type: 0,
    };

    const payload = JSON.stringify({
      comm: { ct: 11, cv: "1003006", tmeAppID: "qqmusiclight" },
      request: {
        method: "GetPlayLyricInfo",
        module: "music.musichallSong.PlayLyricInfo",
        param,
      },
    });

    logger.info("qq-lyric", `Fetching lyrics for id=${songId}`);

    const data = await apiFetch(
      QQ_LYRIC_API,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: payload },
      signal
    );

    // 检查 API 响应结构
    if (!data) {
      logger.info("qq-lyric", "API returned null/undefined");
      return null;
    }

    const reqData = data?.request?.data || data?.data || {};

    logger.info("qq-lyric",
      `lyric=${typeof reqData.lyric}(${(reqData.lyric||"").length}), ` +
      `qrc_t=${reqData.qrc_t}, crypt=${reqData.crypt}`);

    const lyricRaw: string = reqData.lyric || "";

    const result: SongLyric & { _orig?: unknown; _tags?: unknown; _ts?: unknown; _roma?: unknown } = { lyric: "" };

    // Python: if lyric_raw and str(lyric_t) != "0":
    const lyricT = reqData.qrc_t || reqData.lrc_t || 0;
    if (lyricRaw && String(lyricT) !== "0") {
      logger.info("qq-lyric", `Decrypting QRC (${lyricRaw.length} hex chars, lyricT=${lyricT})`);
      try {
        const decrypted = await qrcDecrypt(lyricRaw);
        if (/<Lyric_1 LyricType="1" LyricContent="/.test(decrypted)) {
          const parsed = parseQrc(decrypted);
          result._orig = parsed.orig; result._tags = parsed.tags;
          result.lyric = dataToLrc(parsed.orig);
          logger.info("qq-lyric", `QRC parsed: ${parsed.orig.length} lines`);
        } else {
          const parsed = parseYrc(decrypted);
          result._orig = parsed.orig;
          result.lyric = dataToLrc(parsed.orig);
          logger.info("qq-lyric", `LRC parsed: ${parsed.orig.length} lines`);
        }
      } catch (e) {
        logger.info("qq-lyric", `QRC decrypt/parse failed: ${e}`);
      }
    }

    // 翻译（与原文同逻辑）
    const transRaw = reqData.trans || "";
    const transT = reqData.trans_t || 0;
    if (transRaw && String(transT) !== "0") {
      try {
        const d = await qrcDecrypt(transRaw);
        if (d) {
          const isQrc = /<Lyric_1/.test(d);
          const parsed = isQrc ? parseQrc(d) : parseYrc(d);
          result._ts = parsed.orig;
          result.tlyric = dataToLrc(parsed.orig);
        }
      } catch { /* ignore */ }
    }

    // 罗马音
    const romaRaw = reqData.roma || "";
    const romaT = reqData.roma_t || 0;
    if (romaRaw && String(romaT) !== "0") {
      try {
        const d = await qrcDecrypt(romaRaw);
        if (d) {
          const isQrc = /<Lyric_1/.test(d);
          const parsed = isQrc ? parseQrc(d) : parseYrc(d);
          result._roma = parsed.orig;
        }
      } catch { /* ignore */ }
    }

    // fallback: base64 LRC
    if (!result.lyric && lyricRaw) {
      try { const t=atob(lyricRaw); if(t.includes("[")) result.lyric=t; } catch {/* not base64 */}
    }

    if (!result.lyric) { logger.info("qq-lyric","No lyric obtained"); return null; }
    // 提取结构化逐字数据（QRC parse 结果存在 _orig/_tags/_ts/_roma 上）
    const orig = (result as any)._orig as import("@otter-music/shared").LyricLine[] | undefined;
    const ts = (result as any)._ts as import("@otter-music/shared").LyricLine[] | undefined;
    const roma = (result as any)._roma as import("@otter-music/shared").LyricLine[] | undefined;
    const tags = (result as any)._tags as Record<string, string> | undefined;
    return {
      lyric: result.lyric,
      tlyric: result.tlyric,
      orig: orig && orig.length > 0 ? orig : undefined,
      ts: ts && ts.length > 0 ? ts : undefined,
      roma: roma && roma.length > 0 ? roma : undefined,
      tags: tags && Object.keys(tags).length > 0 ? tags : undefined,
    };
  } catch (e) {
    logger.info("qq-lyric", `Failed: ${e}`);
    return null;
  }
}
