// ============================================================
// 所有平台内置源注册表汇总
// ============================================================

import type { InternalSource, MusicPlatform } from "../types/platform";
import WY_INTERNAL_SOURCES from "./wy-sources";
import QQ_INTERNAL_SOURCES from "./qq-sources";
import KG_INTERNAL_SOURCES from "./kg-sources";
import KW_INTERNAL_SOURCES from "./kw-sources";

export const ALL_INTERNAL_SOURCES: InternalSource[] = [
  ...WY_INTERNAL_SOURCES,
  ...QQ_INTERNAL_SOURCES,
  ...KG_INTERNAL_SOURCES,
  ...KW_INTERNAL_SOURCES,
];

export const INTERNAL_SOURCES_BY_PLATFORM: Record<MusicPlatform, InternalSource[]> = {
  netease: WY_INTERNAL_SOURCES,
  qq: QQ_INTERNAL_SOURCES,
  kugou: KG_INTERNAL_SOURCES,
  kuwo: KW_INTERNAL_SOURCES,
};

export const INTERNAL_SOURCE_MAP: Record<string, InternalSource> = Object.fromEntries(
  ALL_INTERNAL_SOURCES.map((s) => [s.id, s])
);

/** 每平台默认启用：官方 + L1 第三方（top 3-4） */
export const DEFAULT_ENABLED_SOURCES: Record<MusicPlatform, string[]> = {
  netease: ["wy_official", "wy_cgg", "wy_bugpk", "wy_rrvenn"],
  qq: ["qq_official", "qq_xcvts", "qq_vkeys", "qq_lxmusic"],
  kugou: ["kg_official", "kg_haitangw", "kg_317ak"],
  kuwo: ["kw_official", "kw_lxmusic", "kw_haitangw", "kw_nxinxz"],
};

export { WY_INTERNAL_SOURCES, QQ_INTERNAL_SOURCES, KG_INTERNAL_SOURCES, KW_INTERNAL_SOURCES };
