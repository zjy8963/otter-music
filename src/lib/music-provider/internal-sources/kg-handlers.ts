// ============================================================
// 酷狗音乐内置源处理器 — 5 个第三方 API
// 直接从 musicdl/modules/sources/kugou.py 转写
// ============================================================

import type { InternalSourceHandler } from "./base";
import { IS_NATIVE, getApiUrl } from "@/lib/api/config";
import { apiFetch } from "./api-proxy";
const fetchJSON = apiFetch;

export const kgOfficialHandler: InternalSourceHandler = {
  id: "kg_official",
  async resolveUrl(sid) {
    try { const u=`${getApiUrl()}/music-api/kg-thirdparty/official`;
      const r=await fetchJSON(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({hash:sid})});
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
// kg_haitangw — 海棠W API
// musicdl: _parsewithhaitangwapi
// quality: hires, lossless, exhigh
// ============================================================
export const kgHaitangwHandler: InternalSourceHandler = {
  id: "kg_haitangw",
  async resolveUrl(songId, _quality, signal) {
    const qualities = ["hires", "lossless", "exhigh"];
    for (const q of qualities) {
      try {
        // 主域名
        const resp = await fetchJSON(
          `https://musicapi.haitangw.net/kgqq/kg.php?type=json&id=${songId}&level=${q}`,
          { headers: BASE_HEADERS },
          signal
        );
        const url = resp?.data?.url;
        if (url && url.startsWith("http")) return url;
      } catch {
        // 备用域名
        try {
          const resp = await fetchJSON(
            `https://music.haitangw.cc/kgqq/kg.php?type=json&id=${songId}&level=${q}`,
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
// kg_liuyunidc — 流云IDC API（需每日 key，在设置中录入）
// musicdl: GET baimusic/musicurl.php?source=kg&musicId=X&quality=X&card=X
// ============================================================
export const kgLiuyunidcHandler: InternalSourceHandler = {
  id: "kg_liuyunidc",
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
          `https://api.liuyunidc.cn/baimusic/musicurl.php?source=kg&musicId=${songId}&quality=${q}&card=${encodeURIComponent(key)}`,
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
// kg_317ak — 317AK API
// musicdl: _parsewith317akapi
// br: 6=母带, 5=全景声, 4=无损, 3=320k, 2=192k, 1=128k
// ============================================================
const AK317_KEYS_KG = ['charlespikachuUE9WTUhLSklYOEE3SUdIMkZNMVA=', 'charlespikachuWE1VS0lBSjNQOExQWDNQOTcxS1U=', 'charlespikachuN0tUSTUyVDdWTE9EUjZTVDM3UFQ='];

export const kg317akHandler: InternalSourceHandler = {
  id: "kg_317ak",
  async resolveUrl(songId, _quality, signal) {
    const brs = ["6", "5", "4", "3", "2", "1"];
    for (const br of brs) {
      try {
        const apiKey = decryptApiKey(AK317_KEYS_KG[Math.floor(Math.random() * AK317_KEYS_KG.length)]);
        const resp = await fetchJSON(
          `https://api.317ak.cn/api/yinyue/kugou?ckey=${encodeURIComponent(apiKey)}&i=${songId}&br=${br}&type=json&lrc=0`,
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
  },
};

// ============================================================
// kg_jbsou — JBSOU API
// musicdl: _parsewithjbsouapi
// ============================================================
export const kgJbsouHandler: InternalSourceHandler = {
  id: "kg_jbsou",
  async resolveUrl(songId, _quality, signal) {
    try {
      const resp = await fetchJSON(
        "https://www.jbsou.cn/",
        {
          method: "POST",
          headers: {
            ...BASE_HEADERS,
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            Origin: "https://www.jbsou.cn",
            Referer: "https://www.jbsou.cn/",
            "X-Requested-With": "XMLHttpRequest",
            Accept: "application/json, text/javascript, */*; q=0.01",
          },
          body: new URLSearchParams({ input: songId, filter: "id", type: "kugou", page: "1" }),
        },
        signal
      );
      const rel = resp?.data?.[0]?.url;
      if (!rel) return null;
      // url 可能是 "api.php?get=url&..."（无前导 /）或绝对路径或完整 URL
      if (rel.startsWith("http")) return rel;
      return new URL(rel, "https://www.jbsou.cn/").href;
    } catch {
      return null;
    }
  },
};

// ============================================================
// kg_cgg — CGG API（需 TLS 指纹 → Functions 代理）
// musicdl: _parsewithcggapi (curl_cffi)
// ============================================================
export const kgCggHandler: InternalSourceHandler = {
  id: "kg_cgg",
  async resolveUrl(songId, _quality, signal) {
    try {
      const apiUrl = `${getApiUrl()}/music-api/kg-thirdparty/cgg`;
      const resp = await fetchJSON(
        apiUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hash: songId }),
        },
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
// 汇总导出
// ============================================================

export const KG_HANDLERS: InternalSourceHandler[] = [
  kgOfficialHandler,
  kgHaitangwHandler,
  kgLiuyunidcHandler,
  kg317akHandler,
  kgJbsouHandler,
  kgCggHandler,
];

export const KG_HANDLER_MAP: Record<string, InternalSourceHandler> =
  Object.fromEntries(KG_HANDLERS.map((h) => [h.id, h]));
