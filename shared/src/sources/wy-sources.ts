// 网易云音乐内置源 — 完整注册表（28 个源，使用 API 原名）
import type { InternalSource } from "../types/platform";

export const WY_INTERNAL_SOURCES: InternalSource[] = [
  { id: "wy_official", platform: "netease", label: "officialapi", description: "官方 EAPI 接口", priority: 0, tier: "official", requiresProxy: true },
  // L1
  { id: "wy_cgg",        platform: "netease", label: "cggapi",          description: "api-v2.cenguigui.cn",        priority: 1,  tier: "thirdparty", requiresProxy: true },
  { id: "wy_bugpk",      platform: "netease", label: "bugpkapi",        description: "api.bugpk.com",               priority: 2,  tier: "thirdparty", requiresProxy: false },
  { id: "wy_rrvenn",     platform: "netease", label: "rrvennapi",       description: "music.rrvenn.cn",             priority: 3,  tier: "thirdparty", requiresProxy: false },
  { id: "wy_bileizhen",  platform: "netease", label: "bileizhenapi",    description: "api.bileizhen.top",           priority: 4,  tier: "thirdparty", requiresProxy: false },
  { id: "wy_xuanluoge",  platform: "netease", label: "xuanluogeapi",    description: "118.24.104.108:3456",         priority: 5,  tier: "thirdparty", requiresProxy: false },
  { id: "wy_znnu",       platform: "netease", label: "znnuapi",         description: "music.znnu.com",              priority: 6,  tier: "thirdparty", requiresProxy: true },
  { id: "wy_kangqiovo",  platform: "netease", label: "kangqiovoapi",    description: "api.kangqiovo.cn",            priority: 7,  tier: "thirdparty", requiresProxy: false },
  { id: "wy_xiaoqin",    platform: "netease", label: "xiaoqinapi",      description: "nextmusic.toubiec.cn",        priority: 8,  tier: "thirdparty", requiresProxy: true },
  { id: "wy_xingmian",   platform: "netease", label: "xingmianapi",     description: "api.xingmian.cn",             priority: 9,  tier: "thirdparty", requiresProxy: false },
  { id: "wy_haitangw",   platform: "netease", label: "haitangwapi",     description: "musicapi.haitangw.net",       priority: 10, tier: "thirdparty", requiresProxy: false },
  { id: "wy_guyuei",     platform: "netease", label: "guyueiapi",       description: "www.guyuei.com",              priority: 11, tier: "thirdparty", requiresProxy: true },
  // L2
  { id: "wy_vincentzyu233", platform: "netease", label: "vincentzyu233api", description: "xwl.vincentzyu233.cn:51217", priority: 12, tier: "thirdparty", requiresProxy: false },
  { id: "wy_jfjt",       platform: "netease", label: "jfjtapi",         description: "api.jfjt.cc",                 priority: 13, tier: "thirdparty", requiresProxy: false },
  // L3
  { id: "wy_nanorocky",  platform: "netease", label: "nanorockyapi",    description: "metingapi.nanorocky.top",     priority: 14, tier: "thirdparty", requiresProxy: false },
  { id: "wy_manshuo",    platform: "netease", label: "manshuoapi",      description: "api.manshuo.ink",             priority: 15, tier: "thirdparty", requiresProxy: false },
  { id: "wy_cunyu",      platform: "netease", label: "cunyuapi",        description: "api.cunyu.net",               priority: 16, tier: "thirdparty", requiresProxy: false },
  { id: "wy_qjqq",       platform: "netease", label: "qjqqapi",         description: "api.qjqq.cn",                 priority: 17, tier: "thirdparty", requiresProxy: false },
  { id: "wy_yutangxiaowu", platform: "netease", label: "yutangxiaowuapi",description: "yutangxiaowu.cn",            priority: 18, tier: "thirdparty", requiresProxy: false },
  { id: "wy_rxtool",     platform: "netease", label: "rxtoolapi",       description: "rxtool.top",                  priority: 19, tier: "thirdparty", requiresProxy: false },
  { id: "wy_xiaot",      platform: "netease", label: "xiaotapi",        description: "api.s0o1.com",                priority: 20, tier: "thirdparty", requiresProxy: false },
  { id: "wy_gdstudio",   platform: "netease", label: "gdstudioapi",     description: "music-api.gdstudio.xyz",      priority: 21, tier: "thirdparty", requiresProxy: false },
  { id: "wy_byfuns",     platform: "netease", label: "byfunsapi",       description: "api.byfuns.top",              priority: 22, tier: "thirdparty", requiresProxy: false },
  { id: "wy_xcvts",      platform: "netease", label: "xcvtsapi",        description: "api.xcvts.cn",                priority: 23, tier: "thirdparty", requiresProxy: false },
  { id: "wy_ceseet",     platform: "netease", label: "ceseetapi",       description: "m-api.ceseet.me",             priority: 24, tier: "thirdparty", requiresProxy: false },
  { id: "wy_xianyuw",    platform: "netease", label: "xianyuwapi",      description: "apii.xianyuw.cn",             priority: 25, tier: "thirdparty", requiresProxy: false },
  // L4
  { id: "wy_xunjinlu",   platform: "netease", label: "xunjinluapi",     description: "api.xunjinlu.fun",            priority: 26, tier: "thirdparty", requiresProxy: false },
  { id: "wy_lblb",       platform: "netease", label: "lblbapi",         description: "music163.lblb.eu",            priority: 27, tier: "thirdparty", requiresProxy: false },
];
export default WY_INTERNAL_SOURCES;
