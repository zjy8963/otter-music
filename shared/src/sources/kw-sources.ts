// 酷我音乐内置源 — 使用 API 原名
import type { InternalSource } from "../types/platform";
export const KW_INTERNAL_SOURCES: InternalSource[] = [
  { id: "kw_official", platform: "kuwo", label: "officialapi", description: "官方 DES 加密接口", priority: 0, tier: "official", requiresProxy: true },
  { id: "kw_cgg", platform: "kuwo", label: "cggapi", description: "kw-api.cenguigui.cn", priority: 1, tier: "thirdparty", requiresProxy: true },
  { id: "kw_yyy001", platform: "kuwo", label: "yyy001api", description: "apione.apibyte.cn", priority: 2, tier: "thirdparty", requiresProxy: false },
  { id: "kw_lxmusic", platform: "kuwo", label: "lxmusicapi", description: "lxmusicapi.onrender.com", priority: 3, tier: "thirdparty", requiresProxy: false },
  { id: "kw_nxinxz", platform: "kuwo", label: "nxinxzapi", description: "music.nxinxz.com", priority: 4, tier: "thirdparty", requiresProxy: false },
  { id: "kw_haitangw", platform: "kuwo", label: "haitangwapi", description: "musicapi.haitangw.net", priority: 5, tier: "thirdparty", requiresProxy: false },
  { id: "kw_guyuei", platform: "kuwo", label: "guyueiapi", description: "www.guyuei.com", priority: 6, tier: "thirdparty", requiresProxy: true },
  { id: "kw_gdstudio", platform: "kuwo", label: "gdstudioapi", description: "music-api.gdstudio.xyz", priority: 7, tier: "thirdparty", requiresProxy: false },
  { id: "kw_ceseet", platform: "kuwo", label: "ceseetapi", description: "m-api.ceseet.me", priority: 8, tier: "thirdparty", requiresProxy: false },
  { id: "kw_ccwu", platform: "kuwo", label: "ccwuapi", description: "kw.006lp.ccwu.cc", priority: 9, tier: "thirdparty", requiresProxy: false },
  { id: "kw_liuyunidc", platform: "kuwo", label: "liuyunidcapi", description: "kwdec.liuyunidc.cn", priority: 10, tier: "thirdparty", requiresProxy: true },
];
export default KW_INTERNAL_SOURCES;
