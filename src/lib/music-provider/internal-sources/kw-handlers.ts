// ============================================================
// 酷我音乐内置源处理器 — 10 个第三方 API
// 直接从 musicdl/modules/sources/kuwo.py 转写
// ============================================================

import type { InternalSourceHandler } from "./base";
import { getApiUrl } from "@/lib/api/config";
import { apiFetch } from "./api-proxy";
const fetchJSON = apiFetch;

export const kwOfficialHandler: InternalSourceHandler = {
  id: "kw_official",
  async resolveUrl(sid) {
    try { const u=`${getApiUrl()}/music-api/kw-thirdparty/official`;
      const r=await fetchJSON(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:sid})});
      return r?.url?.startsWith("http")?r.url:null;
    } catch { return null; }
  }
};

const BASE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
};

function decryptApiKey(encoded: string): string {
  return atob(encoded.substring(14));
}

// ============================================================
// kw_lxmusic — LXMusic API（洛雪音乐）
// musicdl: _parsewithlxmusicapi
// ============================================================
export const kwLxmusicHandler: InternalSourceHandler = {
  id: "kw_lxmusic",
  async resolveUrl(songId, _quality) {
    try {
      const { IS_NATIVE } = await import("@/lib/api/config");
      if (IS_NATIVE) {
        const { getLxUrl } = await import("@/lib/utils/lx-api");
        return await getLxUrl("lx_kuwo", songId, 320);
      }
      const { apiFetch } = await import("./api-proxy");
      const r = await apiFetch(`https://lxmusicapi.onrender.com/url/kw/${songId}/flac`, {
        headers: { "Content-Type": "application/json", "User-Agent": "lx-music-request/2.6.0", "X-Request-Key": "share-v3" },
      });
      return r?.url?.startsWith("http") ? r.url : null;
    } catch {
      return null;
    }
  },
};

// ============================================================
// kw_haitangw — 海棠W API
// musicdl: _parsewithhaitangwapi
// ============================================================
export const kwHaitangwHandler: InternalSourceHandler = {
  id: "kw_haitangw",
  async resolveUrl(songId, _quality, signal) {
    const qualities = ["lossless", "exhigh", "standard"];
    for (const q of qualities) {
      try {
        const resp = await fetchJSON(
          `https://musicapi.haitangw.net/music/kw.php?id=${songId}&level=${q}&type=json`,
          { headers: BASE_HEADERS },
          signal
        );
        const url = resp?.data?.url;
        if (url && url.startsWith("http")) return url;
      } catch {
        try {
          const resp = await fetchJSON(
            `https://music.haitangw.cc/music/kw.php?id=${songId}&level=${q}&type=json`,
            { headers: BASE_HEADERS },
            signal
          );
          const url = resp?.data?.url;
          if (url && url.startsWith("http")) return url;
        } catch {
          continue;
        }
      }
    }
    return null;
  },
};

// ============================================================
// kw_ceseet — CeSeet API
// musicdl: _parsewithceseetapi
// ============================================================
export const kwCeseetHandler: InternalSourceHandler = {
  id: "kw_ceseet",
  async resolveUrl(songId, _quality, signal) {
    try {
      const resp = await fetchJSON(
        `https://m-api.ceseet.me/url/kw/${songId}/flac`,
        {
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "lx-music-request/2.6.0",
            "X-Request-Key": "",
          },
        },
        signal
      );
      const url = resp?.data;
      return url && url.startsWith("http") ? url : null;
    } catch {
      return null;
    }
  },
};

// ============================================================
// kw_nxinxz — Nxinxz API
// musicdl: _parsewithnxinxzapi
// ============================================================
export const kwNxinxzHandler: InternalSourceHandler = {
  id: "kw_nxinxz",
  async resolveUrl(songId, _quality, signal) {
    const qualities = ["lossless", "exhigh", "standard"];
    for (const q of qualities) {
      try {
        const resp = await fetchJSON(
          `http://music.nxinxz.com/kw.php?id=${songId}&level=${q}&type=json`,
          { headers: BASE_HEADERS },
          signal
        );
        const url = resp?.data?.url;
        if (url && url.startsWith("http")) return url;
      } catch {
        continue;
      }
    }
    return null;
  },
};

// ============================================================
// kw_yyy001 — YYY001 API
// musicdl: _parsewithyyy001api
// ============================================================
const YYY001_KEYS = [
  "U2hhbmhhaS11RENkUGhoQ2xlUmd2WFh5bFFCbHFQVHMyb3RtSGNQbFJ5UWdvdlRsbW8wMDRyZko",
  "U2hhbmhhaS0yYlBxOUJFcFV5ZUtENGNESGc0MHp3Nzl6UDN1SkhqalNTS2hCekpYRVpxakdTbzE",
  "U2hhbmhhaS1XenJBNlFWS2N5RlExYk5aemRSZ1NpVHVhR1Z6N21ET29GamVEM0FvS3NGUlFtZ2M",
];
const YYY001_QUALITIES = ["ff", "p", "h"];

export const kwYyy001Handler: InternalSourceHandler = {
  id: "kw_yyy001",
  async resolveUrl(songId, _quality, signal) {
    for (const q of YYY001_QUALITIES) {
      // 最多重试5次（避免 key 竞争）
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const apiKey = decryptApiKey(YYY001_KEYS[Math.floor(Math.random() * YYY001_KEYS.length)]);
          const resp = await fetchJSON(
            `https://apione.apibyte.cn/kwmusic?key=${encodeURIComponent(apiKey)}&action=music_url&music_id=${songId}&quality=${q}`,
            { headers: BASE_HEADERS },
            signal
          );
          if (resp?.code === "200" || resp?.code === 200) {
            const url = resp?.data?.url;
            if (url && url.startsWith("http")) return url;
          }
        } catch {
          if (attempt < 4) {
            await new Promise((r) => setTimeout(r, 1000)); // 等1秒重试
            continue;
          }
        }
        break;
      }
    }
    return null;
  },
};

// ============================================================
// kw_ccwu — CCWU API（musicdl 已注释禁用: l1_parser_funcs[:0]）
// 不稳定，返回原始 URL 不做保证
// ============================================================
export const kwCcwuHandler: InternalSourceHandler = {
  id: "kw_ccwu",
  async resolveUrl(songId) {
    // musicdl 直接返回 URL 然后由 AudioLinkTester 验证
    // 此 API 不稳定，musicdl 已将其注释掉
    const url = `http://kw.006lp.ccwu.cc:7119/api/song?id=${songId}&level=jymaster&stream=1`;
    // 简单 HTTP 可达性探测
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(url, { method: "HEAD", signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok || r.status < 500) return url;
      return null;
    } catch {
      return null;
    }
  },
};

// ============================================================
// kw_gdstudio — GD Studio API
// musicdl: _parsewithgdstudioapi
// OtterMusic 已有 BaseMusicProvider 使用此 API，直接复用
// ============================================================
export const kwGdstudioHandler: InternalSourceHandler = {
  id: "kw_gdstudio",
  async resolveUrl(songId, _quality, signal) {
    try {
      const { getOrderedMusicApiUrls } = await import("@/lib/api/config");
      const urls = getOrderedMusicApiUrls();
      for (const baseUrl of urls) {
        try {
          const resp = await fetchJSON(
            `${baseUrl}?types=url&id=${songId}&source=kuwo&br=999`,
            { headers: BASE_HEADERS },
            signal
          );
          const url = resp?.url;
          if (url && url.startsWith("http")) return url;
        } catch {
          continue;
        }
      }
      return null;
    } catch {
      return null;
    }
  },
};

// ============================================================
// kw_cgg — CGG API（musicdl: curl_cffi → 有 fallback 到 requests.get）
// ============================================================
export const kwCggHandler: InternalSourceHandler = {
  id: "kw_cgg",
  async resolveUrl(songId) {
    // 先尝试直连（musicdl 有 fallback: curl_cffi 失败后用 requests.get）
    try {
      const r = await fetchJSON(
        `https://kw-api.cenguigui.cn/?id=${songId}&type=song&level=lossless&format=json`,
        { headers: BASE_HEADERS }
      );
      const url = r?.data?.url;
      if (url && url.startsWith("http")) return url;
    } catch {
      // fallback — 直连可能因 TLS 指纹失败，但在 Vite 代理下通常可用
    }
    return null;
  },
};

// ============================================================
// kw_guyuei — 古月I API（客户端 XOR 解密，musicdl _parsewithguyueiapi）
// ============================================================
function decryptGuyueiUrl(encrypted: string): string {
  // musicdl: "A"+encrypted[9:] → base64 → XOR with key "nsh" from index 1 → "http"+result
  const s = encrypted.substring(9);
  const padded = "A" + s + "=".repeat((4 - (s.length % 4)) % 4);
  const dec = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
  const key = [110, 115, 104]; // "nsh"
  let result = "http";
  for (let i = 1; i < dec.length; i++) {
    result += String.fromCharCode(dec[i] ^ key[(i - 1) % 3]);
  }
  return result.replace(/\x00+$/, "");
}

export const kwGuyueiHandler: InternalSourceHandler = {
  id: "kw_guyuei",
  async resolveUrl(songId) {
    try {
      const r = await fetchJSON(
        `https://www.guyuei.com/music/kw.php?url=https://www.kuwo.cn/play_detail/${songId}&yinzhi=hns`,
        { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/147.0.0.0 Safari/537.36" } }
      );
      const encrypted = r?.url;
      if (!encrypted) return null;
      const url = decryptGuyueiUrl(encrypted);
      return url?.startsWith("http") ? url : null;
    } catch {
      return null;
    }
  },
};

// ============================================================
// kw_liuyunidc — 流云IDC API（客户端 RC4 加解密，musicdl: 已注释禁用[:0]）
// 端点: kwdec.liuyunidc.cn/kwurl · 不同于 kg/qq 的 baimusic/musicurl.php
// ============================================================
function rc4(data: Uint8Array, key: Uint8Array): Uint8Array {
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
  }
  let i = 0; j = 0;
  const out = new Uint8Array(data.length);
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) % 256;
    j = (j + s[i]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
    out[k] = data[k] ^ s[(s[i] + s[j]) % 256];
  }
  return out;
}
const RC4_KEY = new TextEncoder().encode("yeelion666");

export const kwLiuyunidcHandler: InternalSourceHandler = {
  id: "kw_liuyunidc",
  async resolveUrl(songId) {
    // musicdl 已注释禁用此源（[:0]），实现供高级用户尝试
    const qualities = ["flac", "320k"];
    const headers = {
      Accept: "*/*", Origin: "https://api.liuyunidc.cn",
      Referer: "https://api.liuyunidc.cn/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/148.0.0.0 Safari/537.36",
    };
    for (const q of qualities) {
      try {
        const payload = JSON.stringify({ id: songId, q });
        const enc = Array.from(rc4(new TextEncoder().encode(payload), RC4_KEY), b => b.toString(16).padStart(2, "0")).join("");
        // 响应是 RC4 密文 hex（非 JSON），直接用 apiFetch 获取文本
        const raw = await fetchJSON(`https://kwdec.liuyunidc.cn/kwurl?data=${enc}`, { headers });
        const hex = typeof raw === "string" ? raw.trim() : JSON.stringify(raw);
        const bytes = new Uint8Array((hex.match(/.{2}/g) || []).map((h: string) => parseInt(h, 16)));
        const dec = rc4(bytes, RC4_KEY);
        const result = JSON.parse(new TextDecoder().decode(dec));
        const url = result?.url;
        if (url && url.startsWith("http")) return url;
      } catch { continue; }
    }
    return null;
  },
};

// ============================================================
// 汇总导出
// ============================================================

export const KW_HANDLERS: InternalSourceHandler[] = [
  kwOfficialHandler,
  kwLxmusicHandler,
  kwHaitangwHandler,
  kwCeseetHandler,
  kwNxinxzHandler,
  kwYyy001Handler,
  kwCcwuHandler,
  kwGdstudioHandler,
  kwCggHandler,
  kwGuyueiHandler,
  kwLiuyunidcHandler,
];

export const KW_HANDLER_MAP: Record<string, InternalSourceHandler> =
  Object.fromEntries(KW_HANDLERS.map((h) => [h.id, h]));
