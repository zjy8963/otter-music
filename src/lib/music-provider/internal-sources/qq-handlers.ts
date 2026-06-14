// ============================================================
// QQ 音乐内置源处理器 — 12 个 API（1 官方 + 11 第三方）
// ============================================================

import type { InternalSourceHandler } from "./base";
import { IS_NATIVE, getApiUrl } from "@/lib/api/config";
import { apiFetch } from "./api-proxy";
const fetchJSON = apiFetch;

// --- Official ---
export const qqOfficialHandler: InternalSourceHandler = {
  id: "qq_official",
  async resolveUrl(sid) {
    try { const u=`${getApiUrl()}/music-api/qq-thirdparty/official`;
      const r=await fetchJSON(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mid:sid})});
      return r?.url?.startsWith("http")?r.url:null;
    } catch { return null; }
  }
};

const BASE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
};

/** 解密 base64 API Key（musicdl 模式：去掉前14字符再base64解码） */
function decryptApiKey(encoded: string): string {
  return atob(encoded.substring(14));
}

// ============================================================
// qq_vkeys — VKeys API
// musicdl: _parsewithvkeysapi
// quality: 0-16 (ThirdPartVKeysAPISongFileType)
// ============================================================
export const qqVkeysHandler: InternalSourceHandler = {
  id: "qq_vkeys",
  async resolveUrl(songId, _quality, signal) {
    // VKeys API 品质从高到低尝试: 14,13,12,11,10,9,8,4
    const qualityIds = [14, 13, 12, 11, 10, 9, 8, 4];
    for (const q of qualityIds) {
      try {
        const resp = await fetchJSON(
          `https://api.vkeys.cn/music/tencent/song/link?mid=${songId}&quality=${q}`,
          { headers: BASE_HEADERS },
          signal
        );
        const url = resp?.data?.url;
        if (isValidQqUrl(url, songId)) return url;
      } catch {
        continue;
      }
    }
    return null;
  },
};

// ============================================================
// 通用 QQ 音频 URL 校验 — 过滤第三方 API 返回的畸形 URL
// 正常: http://ws.stream.qqmusic.qq.com/C400{songmid}.m4a?guid=...&vkey=...
// 异常: http://ws.stream.qqmusic.qq.com/&API=api.xcvts.cn (songmid 缺失)
// ============================================================
function isValidQqUrl(url: string, songmid: string): boolean {
  if (!url || !url.startsWith("http")) return false;
  // URL 中回链到第三方 API 本身 → 异常
  if (url.includes("api.xcvts.cn") || url.includes("api.vkeys.cn") || url.includes("api.liuyunidc")) return false;
  // URL 中不含 songmid 且不含常见音频路径 → 可疑
  if (!url.includes(songmid) && !url.includes(".m4a") && !url.includes(".mp3") && !url.includes(".flac") && !url.includes(".ogg")) return false;
  return true;
}

// ============================================================
// qq_xcvts — XCVTS API
// ============================================================
const XCVTS_KEYS = ["Nzg5OTMzNDRiOWJmMTEwNTY1NTU5OTAwOWNkYmEzZDI","Y2U3NzhlYjBkMTg1OGVkZmI0YjIwNzFhMTE1ZjFlZGY"];
const XCVTS_QUALITIES = ["臻品母带", "臻品全景声", "臻品2.0", "SQ无损", "HQ高品质", "中品质", "普通", "低品质", "试听"];

export const qqXcvtsHandler: InternalSourceHandler = {
  id: "qq_xcvts",
  async resolveUrl(songId, _quality, signal) {
    for (const q of XCVTS_QUALITIES.slice(0, 4)) {
      try {
        const apiKey = atob(XCVTS_KEYS[Math.floor(Math.random() * XCVTS_KEYS.length)]);
        const resp = await fetchJSON(
          `https://api.xcvts.cn/api/music/qq?apiKey=${encodeURIComponent(apiKey)}&mid=${songId}&type=${encodeURIComponent(q)}`,
          { headers: BASE_HEADERS }, signal
        );
        const url = resp?.data?.music;
        if (isValidQqUrl(url, songId)) return url;
      } catch {
        continue;
      }
    }
    return null;
  },
};

// ============================================================
// qq_lxmusic — LXMusic API（洛雪音乐）
// OtterMusic 已有 lx-api.ts 中的 getLxUrl，此处直接复用
// ============================================================
export const qqLxmusicHandler: InternalSourceHandler = {
  id: "qq_lxmusic",
  async resolveUrl(songId, _quality) {
    try {
      const { IS_NATIVE } = await import("@/lib/api/config");
      if (IS_NATIVE) {
        const { getLxUrl } = await import("@/lib/utils/lx-api");
        return await getLxUrl("lx_qq", songId, 320);
      }
      // Web 模式走代理避免 CORS
      const { apiFetch } = await import("./api-proxy");
      const r = await apiFetch(`https://lxmusicapi.onrender.com/url/tx/${songId}/320k`, {
        headers: { "Content-Type": "application/json", "User-Agent": "lx-music-request/2.6.0", "X-Request-Key": "share-v3" },
      });
      return r?.url?.startsWith("http") ? r.url : null;
    } catch {
      return null;
    }
  },
};

// ============================================================
// qq_liuyunidc — 流云IDC API（需每日 key，在设置中录入）
// ============================================================
export const qqLiuyunidcHandler: InternalSourceHandler = {
  id: "qq_liuyunidc",
  async resolveUrl(songId) {
    const { useSourceConfigStore } = await import("@/store/source-config-store");
    const key = useSourceConfigStore.getState().liuyunKey;
    if (!key) return null;
    const qualities = ["flac", "320k", "128k"];
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
      Accept: "application/json",
      Referer: "http://api.liuyunidc.cn/baimusic/",
    };
    for (const q of qualities) {
      try {
        const r = await fetchJSON(
          `https://api.liuyunidc.cn/baimusic/musicurl.php?source=tx&musicId=${songId}&quality=${q}&card=${encodeURIComponent(key)}`,
          { headers }
        );
        const url = r?.url;
        if (url && url.startsWith("http")) return url;
      } catch { continue; }
    }
    return null;
  },
};

// ============================================================
// qq_317ak — 317AK API
// musicdl: _parsewith317akapi
// ============================================================
const AK317_KEYS_QQ = ["Wk83NlFKQ0lINVBQSUNKT09YVUg"];

export const qq317akHandler: InternalSourceHandler = {
  id: "qq_317ak",
  async resolveUrl(songId, _quality, signal) {
    // br: 7=母带, 9=全景声, 10=臻品2.0, 8=无损, 6=320k, 5=128k
    const brs = ["7", "9", "10", "8", "6", "5"];
    for (const br of brs) {
      try {
        const apiKey = decryptApiKey(AK317_KEYS_QQ[0]);
        const resp = await fetchJSON(
          `https://api.317ak.cn/api/yinyue/qqyinyue?ckey=${encodeURIComponent(apiKey)}&i=${songId}&br=${br}&type=json&lrc=0`,
          { headers: BASE_HEADERS },
          signal
        );
        const url = resp?.url;
        if (isValidQqUrl(url, songId)) return url;
      } catch { continue; }
    }
    return null;
  },
};

// ============================================================
// qq_nki — NKI API
// musicdl: _parsewithnkiapi
// ============================================================
const NKI_KEYS = [
  "MjhmZWNlOTI1NDM5YjA1Mjc5MmE5Nzk4OWM4NzBjZWQzODAzYTcxYzZiNTM0ZjcxZTVhNTMzMzhiMmQzMWVmOA",
  "YzRjNGY1ZmMzNmJhZDRjYWNiOTg4MzllMTRmZWE0MDI3N2IzNWVhMmViMWJhYmRhZDdiYmRlMTI4NDAwZjNiMQ",
];

export const qqNkiHandler: InternalSourceHandler = {
  id: "qq_nki",
  async resolveUrl(songId, _quality, signal) {
    try {
      const apiKey = atob(NKI_KEYS[Math.floor(Math.random() * NKI_KEYS.length)]);
      const resp = await fetchJSON(
        `https://api.nki.pw/API/music_open_api.php?mid=${songId}&apikey=${encodeURIComponent(apiKey)}`,
        {
          headers: {
            ...BASE_HEADERS,
            "sec-ch-ua": '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
          },
        },
        signal
      );
      // 多音质降级
      const url =
        resp?.song_play_url_sq ||
        resp?.song_play_url_pq ||
        resp?.song_play_url_hq ||
        resp?.song_play_url ||
        resp?.song_play_url_standard ||
        resp?.song_play_url_fq;
      return url && url.startsWith("http") ? url : null;
    } catch {
      return null;
    }
  },
};

// ============================================================
// qq_tang — Tang API
// musicdl: _parsewithtangapi
// ============================================================
export const qqTangHandler: InternalSourceHandler = {
  id: "qq_tang",
  async resolveUrl(songId, _quality, signal) {
    try {
      const resp = await fetchJSON(
        `https://tang.api.s01s.cn/music_open_api.php?mid=${songId}`,
        { headers: BASE_HEADERS },
        signal
      );
      const url =
        resp?.song_play_url_sq ||
        resp?.song_play_url_pq ||
        resp?.song_play_url_hq ||
        resp?.song_play_url ||
        resp?.song_play_url_standard ||
        resp?.song_play_url_fq;
      return url && url.startsWith("http") ? url : null;
    } catch {
      return null;
    }
  },
};

// ============================================================
// qq_cy — CY API
// musicdl: _parsewithcyapi
// ============================================================
const CY_KEYS = [
  "1ffdf5733f5d538760e63d7e46ba17438d9f7b9dfc18c51be1109386fd74c3a1",
  "2baf39266d8ef0580aba937245d5bb569fe376f230ff508f1faa0922dc320fe4",
];

export const qqCyHandler: InternalSourceHandler = {
  id: "qq_cy",
  async resolveUrl(songId, _quality, signal) {
    try {
      const apiKey = CY_KEYS[Math.floor(Math.random() * CY_KEYS.length)];
      const resp = await fetchJSON(
        `https://cyapi.top/API/qq_music.php?apikey=${encodeURIComponent(apiKey)}&type=json&mid=${songId}&quality=lossless`,
        { headers: BASE_HEADERS },
        signal
      );
      const url = resp?.url;
      return url && url.startsWith("http") ? url : null;
    } catch {
      return null;
    }
  },
};

// ============================================================
// qq_xianyuw — 闲鱼W API
// musicdl: _parsewithxianyuwapi
// ============================================================
const XIANYUW_KEYS_QQ = [
  "c2stYTdiNDJjOGRkZGZlMWYxODk0M2MwODM4Nzk1ZjNjNzA",
  "c2stYzlmNDNlYWFmODI3Njc0MzNhOGE1NDRmNmI2MTcwYjc",
];

export const qqXianyuwHandler: InternalSourceHandler = {
  id: "qq_xianyuw",
  async resolveUrl(songId, _quality, signal) {
    try {
      const apiKey = decryptApiKey(XIANYUW_KEYS_QQ[Math.floor(Math.random() * XIANYUW_KEYS_QQ.length)]);
      const resp = await fetchJSON(
        `https://apii.xianyuw.cn/api/v1/qq-music-search?id=${songId}&key=${encodeURIComponent(apiKey)}&no_url=0&br=hires`,
        { headers: BASE_HEADERS },
        signal
      );
      const url = resp?.data?.url;
      return url && url.startsWith("http") ? url : null;
    } catch {
      return null;
    }
  },
};

// ============================================================
// qq_xunhuisi — 巡回寺 API
// musicdl: _parsewithxunhuisiapi
// ============================================================
export const qqXunhuisiHandler: InternalSourceHandler = {
  id: "qq_xunhuisi",
  async resolveUrl(songId, _quality, signal) {
    try {
      const resp = await fetchJSON(
        `https://api.xunhuisi.store/API/QQMusic/Song.php?mid=${songId}&type=json`,
        { headers: BASE_HEADERS },
        signal
      );
      const url = resp?.music_url;
      return url && url.startsWith("http") ? url : null;
    } catch {
      return null;
    }
  },
};

// ============================================================
// qq_lpz — LPZ API
// musicdl: _parsewithlpzapi
// ============================================================
export const qqLpzHandler: InternalSourceHandler = {
  id: "qq_lpz",
  async resolveUrl(songId, _quality, signal) {
    try {
      const resp = await fetchJSON(
        `https://lpz.chatc.vip/apiqq.php?songmid=${songId}&type=json&br=1`,
        { headers: BASE_HEADERS },
        signal
      );
      const url = resp?.data?.music_url;
      return url && url.startsWith("http") ? url : null;
    } catch {
      return null;
    }
  },
};

// ============================================================
// 汇总导出
// ============================================================

export const QQ_HANDLERS: InternalSourceHandler[] = [
  qqOfficialHandler,
  qqVkeysHandler,
  qqXcvtsHandler,
  qqLxmusicHandler,
  qqLiuyunidcHandler,
  qq317akHandler,
  qqNkiHandler,
  qqTangHandler,
  qqCyHandler,
  qqXianyuwHandler,
  qqXunhuisiHandler,
  qqLpzHandler,
];

export const QQ_HANDLER_MAP: Record<string, InternalSourceHandler> =
  Object.fromEntries(QQ_HANDLERS.map((h) => [h.id, h]));
