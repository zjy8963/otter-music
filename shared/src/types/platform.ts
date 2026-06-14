// ============================================================
// 平台与内置源两级音源体系
// ============================================================

/** 一级：音乐平台标识 */
export type MusicPlatform = "netease" | "qq" | "kugou" | "kuwo";

/** 内置源类别 */
export type InternalSourceTier = "official" | "thirdparty";

/** 源可用性测试结果 */
export type SourceTestResult = "ok" | "fail" | "timeout" | null;

/** 二级：平台下的内置源定义（静态注册表） */
export interface InternalSource {
  /** 唯一标识，如 "wy_cgg"、"qq_vkeys"、"kg_haitangw"、"kw_ccwu" */
  id: string;
  /** 所属平台 */
  platform: MusicPlatform;
  /** 显示名称 */
  label: string;
  /** 简要描述 */
  description: string;
  /** 平台内优先级（数字越小越优先） */
  priority: number;
  /** 官方 / 第三方 */
  tier: InternalSourceTier;
  /** 是否需要 Cloudflare Functions 代理（Web端） */
  requiresProxy: boolean;
}

/** 内置源运行时配置（持久化到 IndexedDB） */
export interface InternalSourceConfig {
  /** 对应 InternalSource.id */
  id: string;
  /** 用户是否启用 */
  enabled: boolean;
  /** 用户自定义优先级（覆盖默认 priority） */
  userPriority: number | null;
  /** 最近测试结果 */
  lastTestResult: SourceTestResult;
  /** 最近测试时间戳 */
  lastTestTime: number | null;
}

/** 平台音源配置（设置 UI 用） */
export interface PlatformSourceConfig {
  platform: MusicPlatform;
  /** 平台是否参与聚合搜索 */
  enabled: boolean;
  /** 平台下的内置源配置列表 */
  sources: InternalSourceConfig[];
}

/** 平台上所有源的汇总状态 */
export interface PlatformSourceStatus {
  platform: MusicPlatform;
  /** 已启用的内置源数量 */
  enabledCount: number;
  /** 总内置源数量 */
  totalCount: number;
  /** 已启用的源中最近测试通过的占比 */
  healthyRate: number;
}

/** 平台标签映射 */
export const PLATFORM_LABELS: Record<MusicPlatform, string> = {
  netease: "网易云音乐",
  qq: "QQ音乐",
  kugou: "酷狗音乐",
  kuwo: "酷我音乐",
};

/** 平台描述 */
export const PLATFORM_DESCRIPTIONS: Record<MusicPlatform, string> = {
  netease: "搜索覆盖广，小众资源丰富",
  qq: "版权最全，音质上限高",
  kugou: "曲库互补，老歌资源多",
  kuwo: "免费资源多，稳定性一般",
};
