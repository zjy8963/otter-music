// 酷狗音乐内置源 — 使用 API 原名
import type { InternalSource } from "../types/platform";
export const KG_INTERNAL_SOURCES: InternalSource[] = [
  { id: "kg_official", platform: "kugou", label: "officialapi", description: "官方 getsongurl 接口", priority: 0, tier: "official", requiresProxy: true },
  { id: "kg_liuyunidc", platform: "kugou", label: "liuyunidcapi", description: "api.liuyunidc.cn", priority: 1, tier: "thirdparty", requiresProxy: true },
  { id: "kg_317ak", platform: "kugou", label: "317akapi", description: "api.317ak.cn", priority: 2, tier: "thirdparty", requiresProxy: false },
  { id: "kg_haitangw", platform: "kugou", label: "haitangwapi", description: "musicapi.haitangw.net", priority: 3, tier: "thirdparty", requiresProxy: false },
  { id: "kg_jbsou", platform: "kugou", label: "jbsouapi", description: "www.jbsou.cn", priority: 4, tier: "thirdparty", requiresProxy: false },
  { id: "kg_cgg", platform: "kugou", label: "cggapi", description: "music-api2.cenguigui.cn", priority: 5, tier: "thirdparty", requiresProxy: true },
];
export default KG_INTERNAL_SOURCES;
