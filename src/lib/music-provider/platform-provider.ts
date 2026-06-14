// ============================================================
// PlatformProvider
//
// 一个 PlatformProvider 聚合一个平台下所有已启用的内置源，
// 实现 IMusicProvider 接口。
//
// getUrl 流程：
//   1. 遍历平台内已启用的内置源（按优先级排序）
//   2. 依次调用 handler.resolveUrl()
//   3. 第一个返回有效 URL 的 → 成功
//   4. 全部失败 → 返回 null → 触发跨平台换源
// ============================================================

import type { IMusicProvider } from "./interface";
import type {
  MusicPlatform,
  MusicTrack,
  SearchPageResult,
  SongLyric,
  SearchIntent,
} from "@otter-music/shared";
import type { InternalSourceHandler } from "./internal-sources/base";
import { PlatformSourceManager } from "./source-manager";
import { useSourceQualityStore } from "@/store/source-quality-store";
import { logger } from "@/lib/logger";

/**
 * PlatformProvider 配置
 */
export interface PlatformProviderConfig {
  platform: MusicPlatform;
  /** 搜索实现（不同平台搜索 API 不同，由外部注入） */
  searchImpl: (
    query: string,
    page: number,
    count: number,
    signal?: AbortSignal,
    intent?: SearchIntent | null
  ) => Promise<SearchPageResult<MusicTrack>>;
  /** 封面获取实现 */
  getPicImpl?: (track: MusicTrack, size?: number) => Promise<string | null>;
  /** 歌词获取实现 */
  getLyricImpl?: (track: MusicTrack) => Promise<SongLyric | null>;
  /** 源管理器 */
  sourceManager: PlatformSourceManager;
}

export class PlatformProvider implements IMusicProvider {
  readonly source: string;
  private config: PlatformProviderConfig;

  constructor(config: PlatformProviderConfig) {
    this.config = config;
    this.source = config.platform;
  }

  get sourceManager(): PlatformSourceManager {
    return this.config.sourceManager;
  }

  // ============================================================
  // 搜索 — 使用平台官方搜索 API
  // ============================================================

  async search(
    query: string,
    page: number,
    count: number,
    signal?: AbortSignal,
    intent?: SearchIntent | null
  ): Promise<SearchPageResult<MusicTrack>> {
    return this.config.searchImpl(query, page, count, signal, intent);
  }

  // ============================================================
  // getUrl — 并发竞速：每批 5 个并发，首个返回即截断其余
  // ============================================================

  async getUrl(track: MusicTrack, br?: number, signal?: AbortSignal): Promise<string | null> {
    const enabledHandlers = this.config.sourceManager.getEnabledHandlers();

    if (enabledHandlers.length === 0) {
      logger.warn("PlatformProvider", `No enabled sources for ${this.source}`);
      return null;
    }

    const songId = this.extractSongId(track);
    if (!songId) {
      logger.warn("PlatformProvider", `No songId for track ${track.id}`);
      return null;
    }

    const quality = this.mapQuality(br);
    const CONCURRENT = 5;
    const source = this.source as any;

    const NULL_ABORT_THRESHOLD = 3;

    // 分批并发竞速
    for (let i = 0; i < enabledHandlers.length; i += CONCURRENT) {
      const batch = enabledHandlers.slice(i, i + CONCURRENT);
      const ctrl = new AbortController();
      // 合并外部 signal（切歌时外部 abort → 内部也 abort）
      if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });
      let copyrightFailCount = 0;
      const errorTrack = { error: false };

      const callHandler = (handler: InternalSourceHandler) =>
        handler.resolveUrl(songId, quality, ctrl.signal)
          .then((url) => {
            if (url && typeof url === "string" && url.startsWith("http")) return url;
            return "__no_copyright__" as const;
          })
          .catch(() => {
            errorTrack.error = true;
            return "__error__" as const;
          });

      const url = await new Promise<string | null>((resolve) => {
        let settled = false;
        let completed = 0;

        for (const handler of batch) {
          callHandler(handler).then((result) => {
            if (settled) return;
            if (result === "__error__") {
              completed++;
              if (completed >= batch.length) resolve(null);
              return;
            }
            if (result === "__no_copyright__") {
              copyrightFailCount++;
              completed++;
              if (!settled && copyrightFailCount >= NULL_ABORT_THRESHOLD) {
                settled = true;
                ctrl.abort();
                logger.info("PlatformProvider", `${source}: ${copyrightFailCount} no-copyright → cross-platform`);
                resolve(null);
              } else if (completed >= batch.length) resolve(null);
              return;
            }
            // 有效的 URL
            settled = true;
            ctrl.abort();
            useSourceQualityStore.getState().recordSuccess(source);
            resolve(result);
          });
        }
      });

      if (url) return url;
      if (copyrightFailCount >= NULL_ABORT_THRESHOLD) break;
      if (errorTrack.error) break; // 有网络错误也停止，让跨平台接管
    }

    useSourceQualityStore.getState().recordFail(source);
    return null;
  }

  // ============================================================
  // getPic — 封面
  // ============================================================

  async getPic(track: MusicTrack, size?: number): Promise<string | null> {
    if (this.config.getPicImpl) {
      return this.config.getPicImpl(track, size);
    }
    // 默认：从 track 自带的 pic_id 返回
    return track.pic_id || null;
  }

  // ============================================================
  // getLyric — 歌词
  // ============================================================

  async getLyric(track: MusicTrack): Promise<SongLyric | null> {
    if (this.config.getLyricImpl) {
      return this.config.getLyricImpl(track);
    }
    return null;
  }

  // ============================================================
  // 扩展能力
  // ============================================================

  async searchArtist(
    query: string,
    page: number,
    count: number
  ): Promise<SearchPageResult<MusicTrack>> {
    return this.search(query, page, count, undefined);
  }

  async searchAlbum(
    query: string,
    page: number,
    count: number
  ): Promise<SearchPageResult<MusicTrack>> {
    return this.search(query, page, count, undefined);
  }

  // ============================================================
  // 私有工具方法
  // ============================================================

  /**
   * 从 MusicTrack 提取平台特定的 songId
   * - 网易云: track.id (数字ID)
   * - QQ: track.url_id 或 track.lyric_id (songmid)
   * - 酷狗: track.url_id (FileHash)
   * - 酷我: track.url_id 或 track.lyric_id (musicrid)
   */
  private extractSongId(track: MusicTrack): string {
    // 优先使用 url_id（存储的是平台的原始标识符）
    if (track.url_id) {
      // 去掉可能的平台前缀 (如 "qq_", "kg_")
      const cleaned = track.url_id.replace(/^(netease|qq|kg|kw|wy)_/, "");
      if (cleaned) return cleaned;
    }
    if (track.lyric_id) {
      const cleaned = track.lyric_id.replace(/^(netease|qq|kg|kw|wy)_/, "");
      if (cleaned) return cleaned;
    }
    return track.id;
  }

  /**
   * 比特率 → 音质标签
   */
  private mapQuality(br?: number): string {
    if (!br || br <= 128) return "standard";
    if (br <= 192) return "exhigh";
    if (br <= 320) return "lossless";
    return "hires";
  }
}
