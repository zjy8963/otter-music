// QQ 音乐内置源 — 使用 API 原名
import type { InternalSource } from "../types/platform";
export const QQ_INTERNAL_SOURCES: InternalSource[] = [
  { id: "qq_official", platform: "qq", label: "officialapi", description: "官方 vkey/EVkey 接口", priority: 0, tier: "official", requiresProxy: true },
  { id: "qq_xcvts", platform: "qq", label: "xcvtsapi", description: "api.xcvts.cn", priority: 1, tier: "thirdparty", requiresProxy: false },
  { id: "qq_liuyunidc", platform: "qq", label: "liuyunidcapi", description: "api.liuyunidc.cn", priority: 2, tier: "thirdparty", requiresProxy: true },
  { id: "qq_nki", platform: "qq", label: "nkiapi", description: "api.nki.pw", priority: 3, tier: "thirdparty", requiresProxy: false },
  { id: "qq_tang", platform: "qq", label: "tangapi", description: "tang.api.s01s.cn", priority: 4, tier: "thirdparty", requiresProxy: false },
  { id: "qq_vkeys", platform: "qq", label: "vkeysapi", description: "api.vkeys.cn", priority: 5, tier: "thirdparty", requiresProxy: false },
  { id: "qq_317ak", platform: "qq", label: "317akapi", description: "api.317ak.cn", priority: 6, tier: "thirdparty", requiresProxy: false },
  { id: "qq_cy", platform: "qq", label: "cyapi", description: "cyapi.top", priority: 7, tier: "thirdparty", requiresProxy: false },
  { id: "qq_xunhuisi", platform: "qq", label: "xunhuisiapi", description: "api.xunhuisi.store", priority: 8, tier: "thirdparty", requiresProxy: false },
  { id: "qq_lxmusic", platform: "qq", label: "lxmusicapi", description: "lxmusicapi.onrender.com", priority: 9, tier: "thirdparty", requiresProxy: false },
  { id: "qq_xianyuw", platform: "qq", label: "xianyuwapi", description: "api.xianyuw.cn", priority: 10, tier: "thirdparty", requiresProxy: false },
  { id: "qq_lpz", platform: "qq", label: "lpzapi", description: "lpz.chatc.vip", priority: 11, tier: "thirdparty", requiresProxy: false },
];
export default QQ_INTERNAL_SOURCES;
