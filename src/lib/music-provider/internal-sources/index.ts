// ============================================================
// 所有内置源处理器汇总
// ============================================================

export type { InternalSourceHandler, InternalSourceHandlerFactory } from "./base";
export { sortHandlersByPriority } from "./base";

export { WY_HANDLERS, WY_HANDLER_MAP } from "./wy-handlers";
export { QQ_HANDLERS, QQ_HANDLER_MAP } from "./qq-handlers";
export { KG_HANDLERS, KG_HANDLER_MAP } from "./kg-handlers";
export { KW_HANDLERS, KW_HANDLER_MAP } from "./kw-handlers";

import type { InternalSourceHandler } from "./base";
import type { MusicPlatform } from "@otter-music/shared";
import { WY_HANDLERS } from "./wy-handlers";
import { QQ_HANDLERS } from "./qq-handlers";
import { KG_HANDLERS } from "./kg-handlers";
import { KW_HANDLERS } from "./kw-handlers";

/** 全部 37 个处理器（按平台分组） */
export const ALL_HANDLERS_BY_PLATFORM: Record<MusicPlatform, InternalSourceHandler[]> = {
  netease: WY_HANDLERS,
  qq: QQ_HANDLERS,
  kugou: KG_HANDLERS,
  kuwo: KW_HANDLERS,
};

/** 所有处理器 flat 列表 */
export const ALL_HANDLERS: InternalSourceHandler[] = [
  ...WY_HANDLERS,
  ...QQ_HANDLERS,
  ...KG_HANDLERS,
  ...KW_HANDLERS,
];

/** 按 handler id 索引 */
export const HANDLER_MAP: Record<string, InternalSourceHandler> =
  Object.fromEntries(ALL_HANDLERS.map((h) => [h.id, h]));
