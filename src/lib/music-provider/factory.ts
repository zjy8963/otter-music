import { IMusicProvider } from "./interface";
import { MusicSource } from "@/types/music";
import { LocalProvider } from "./providers/local-provider";
import { AggregateProvider } from "./providers/aggregate-provider";
import { PodcastProvider } from "./providers/podcast-provider";
import { JooxProvider } from "./providers/joox-provider";
// import { KuwoProvider } from "./providers/kuwo-provider";
// import { KugouApiProvider } from "./providers/kugou-api-provider";
import { MiguApiProvider } from "./providers/migu-api-provider";
// 旧 Provider 已屏蔽，统一走 PlatformProvider
// import { NeteaseProvider } from "./providers/netease-provider";
// import { QqApiProvider } from "./providers/qq-api-provider";
// import { NeteaseApiProvider } from "./providers/netease-api-provider";
import { BilibiliApiProvider } from "./providers/bilibili-api-provider";
// import { LxKuwoProvider } from "./providers/lx-kuwo-provider";
// import { LxQqProvider } from "./providers/lx-qq-provider";

// 新的分层音源架构
import { PlatformProvider } from "./platform-provider";
import { PlatformSourceManager } from "./source-manager";
import type { MusicPlatform, MusicTrack, SearchPageResult } from "@otter-music/shared";

/** 平台源管理器单例缓存 */
const platformManagers = new Map<MusicPlatform, PlatformSourceManager>();

/** 获取或创建平台源管理器 */
function getPlatformManager(platform: MusicPlatform): PlatformSourceManager {
  if (!platformManagers.has(platform)) {
    platformManagers.set(platform, new PlatformSourceManager(platform));
  }
  return platformManagers.get(platform)!;
}

/**
 * 创建四大平台的 PlatformProvider（接入分层音源体系）
 * 搜索仍走原实现，getUrl 走内置源 fallback 链
 */
function createPlatformProviders(): Record<MusicPlatform, IMusicProvider> {
  // 延迟导入搜索实现以避免循环依赖
  const neteaseSearch = async (
    query: string,
    page: number,
    count: number,
    signal?: AbortSignal,
    _intent?: any
  ): Promise<SearchPageResult<MusicTrack>> => {
    const { search: wySearch, convertSongToMusicTrack } = await import("@/lib/netease/netease-api");
    const res = await wySearch(query, 1, page, count);
    const songs = res.data.result.songs || [];
    return {
      items: songs.map((s: any) => ({ ...convertSongToMusicTrack(s), source: "netease" as const })),
      hasMore: res.data.result.hasMore ?? ((res.data.result.songCount || 0) > page * count),
    };
  };

  const qqSearch = async (
    query: string,
    page: number,
    _count: number,
    signal?: AbortSignal,
    _intent?: any
  ): Promise<SearchPageResult<MusicTrack>> => {
    const { searchQqMusic } = await import("@/lib/qqmusic/qqmusic-api");
    return searchQqMusic(query, page, signal);
  };

  // 酷狗/酷我搜索暂用 GD Studio API 回退
  const makeGenericSearch = (platform: MusicPlatform) => {
    return async (
      query: string,
      page: number,
      count: number,
      signal?: AbortSignal,
    ): Promise<SearchPageResult<MusicTrack>> => {
      const { requestMusicApiJSON, normalizeTrack } = await import("./utils");
      const json = await requestMusicApiJSON<any[]>(
        { types: "search", name: query, count, pages: page },
        platform as any,
        signal
      );
      const items = json.map((t: any) => normalizeTrack(t, platform as any));
      return { items, hasMore: items.length === count };
    };
  };

  return {
    netease: new PlatformProvider({
      platform: "netease",
      searchImpl: neteaseSearch,
      sourceManager: getPlatformManager("netease"),
    }),
    qq: new PlatformProvider({
      platform: "qq",
      searchImpl: qqSearch,
      sourceManager: getPlatformManager("qq"),
    }),
    kugou: new PlatformProvider({
      platform: "kugou",
      searchImpl: makeGenericSearch("kugou" as MusicPlatform),
      sourceManager: getPlatformManager("kugou"),
    }),
    kuwo: new PlatformProvider({
      platform: "kuwo",
      searchImpl: makeGenericSearch("kuwo" as MusicPlatform),
      sourceManager: getPlatformManager("kuwo"),
    }),
  };
}

export class MusicProviderFactory {
  private static instances = new Map<string, IMusicProvider>();
  private static platformProviders: Record<MusicPlatform, IMusicProvider> | null = null;

  /** 获取/懒初始化平台层 Provider */
  private static getPlatformProviders() {
    if (!this.platformProviders) {
      this.platformProviders = createPlatformProviders();
    }
    return this.platformProviders;
  }

  static getProvider(source: MusicSource): IMusicProvider {
    if (this.instances.has(source)) {
      return this.instances.get(source)!;
    }

    let provider: IMusicProvider;

    switch (source) {
      case "all":
        provider = new AggregateProvider((s) => this.getProvider(s));
        break;
      // --- 新分层音源：四大平台 -> PlatformProvider ---
      case "netease":
      case "qq":
      case "kugou":
      case "kuwo":
        provider = this.getPlatformProviders()[source as MusicPlatform];
        break;
      // --- 旧音源已全部屏蔽，统一走 PlatformProvider ---
      case "_netease":
        provider = this.getPlatformProviders()["netease" as MusicPlatform];
        break;
      case "local":
        provider = new LocalProvider();
        break;
      case "podcast":
        provider = new PodcastProvider();
        break;
      case "joox":
        provider = new JooxProvider();
        break;
      case "migu":
        provider = new MiguApiProvider();
        break;
      case "bilibili":
        provider = new BilibiliApiProvider();
        break;
      case "lx_kuwo":
        provider = this.getPlatformProviders()["kuwo" as MusicPlatform];
        break;
      case "lx_qq":
        provider = this.getPlatformProviders()["qq" as MusicPlatform];
        break;
      default:
        throw new Error(`不支持的音乐源: ${source}`);
    }

    this.instances.set(source, provider);
    return provider;
  }

  /** 导出平台源管理器（供设置 UI 使用） */
  static getSourceManager(platform: MusicPlatform): PlatformSourceManager {
    return getPlatformManager(platform);
  }
}
