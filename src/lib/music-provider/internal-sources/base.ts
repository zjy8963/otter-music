// ============================================================
// 内置源处理器接口
// ============================================================

/** 无版权标记 — API 正常响应但歌曲无版权/下架，区别于网络错误 */
export const NO_COPYRIGHT = Symbol("no_copyright");

/** resolveUrl 返回值 */
export type ResolveResult = string | typeof NO_COPYRIGHT | null;

export interface InternalSourceHandler {
  readonly id: string;

  /**
   * 解析歌曲播放 URL
   * @returns string        = 可播放的 HTTPS URL
   *          NO_COPYRIGHT  = API 正常响应但无版权/下架
   *          null          = 网络错误/超时/源失效
   */
  resolveUrl(
    songId: string,
    quality?: string,
    signal?: AbortSignal
  ): Promise<ResolveResult>;

  resolveLyric?(
    songId: string,
    signal?: AbortSignal
  ): Promise<string | null>;
}

export type InternalSourceHandlerFactory = () => InternalSourceHandler;

export function sortHandlersByPriority(
  handlers: InternalSourceHandler[],
  priorities: Record<string, number>
): InternalSourceHandler[] {
  return [...handlers].sort(
    (a, b) => (priorities[a.id] ?? 999) - (priorities[b.id] ?? 999)
  );
}
