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
import { useSourceConfigStore } from "@/store/source-config-store";

// 歌词获取实现
import { fetchNeteaseLyric } from "./lyrics/netease";
import { fetchQqLyric } from "./lyrics/qq";
import { fetchKugouLyric } from "./lyrics/kugou";
import { fetchKuwoLyric } from "./lyrics/kuwo";

/** 平台源管理器单例缓存 */
const platformManagers = new Map<MusicPlatform, PlatformSourceManager>();

/** 获取或创建平台源管理器（自动从 store 同步配置） */
function getPlatformManager(platform: MusicPlatform): PlatformSourceManager {
  if (!platformManagers.has(platform)) {
    platformManagers.set(platform, new PlatformSourceManager(platform));
  }
  const mgr = platformManagers.get(platform)!;

  // 每次获取时从 store 同步最新配置
  const storeConfigs = useSourceConfigStore.getState().configs;
  const platformConfig = storeConfigs[platform] || {};
  if (Object.keys(platformConfig).length > 0) {
    const enabled: Record<string, boolean> = {};
    for (const [id, cfg] of Object.entries(platformConfig)) {
      enabled[id] = cfg.enabled;
    }
    mgr.applySettingsSnapshot({ enabled });
  }
  return mgr;
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

  // === 酷狗官方搜索 (songsearch.kugou.com/song_search_v2) ===
  const kugouSearch = async (
    query: string,
    page: number,
    count: number,
    signal?: AbortSignal,
  ): Promise<SearchPageResult<MusicTrack>> => {
    const { apiFetch } = await import("./internal-sources/api-proxy");
    try {
      const params = new URLSearchParams({
        format: "json", keyword: query, platform: "WebFilter",
        page: String(page), pagesize: String(Math.min(count, 30)),
      });
      const data = await apiFetch(`https://songsearch.kugou.com/song_search_v2?${params}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      }, signal);
      const lists: any[] = data?.data?.lists || [];
      const items: MusicTrack[] = lists.map((s: any) => {
        const hash = (s.FileHash || s.hash || "").toString();
        const coverTpl = s.trans_param?.union_cover || "";
        return {
          id: `kg_${hash}`,
          name: s.SongName || s.songname || s.AudioName || "",
          artist: [s.SingerName || s.singername || ""].filter(Boolean),
          album: s.AlbumName || s.album_name || "",
          pic_id: typeof coverTpl === "string" && coverTpl.startsWith("http") ? coverTpl.replace("{size}", "400") : "",
          url_id: hash,
          lyric_id: hash,
          source: "kugou" as const,
        };
      });
      return { items, hasMore: lists.length >= count };
    } catch { return { items: [], hasMore: false }; }
  };

  // === 酷我官方搜索 (kuwo.cn/search/searchMusicBykeyWord) ===
  // 字段名参考 JaurusMusic _extract_kuwo_metadata
  const kuwoSearch = async (
    query: string,
    page: number,
    count: number,
    signal?: AbortSignal,
  ): Promise<SearchPageResult<MusicTrack>> => {
    const { apiFetch } = await import("./internal-sources/api-proxy");
    try {
      const params = new URLSearchParams({
        vipver: "1", client: "kt", ft: "music", cluster: "0", strategy: "2012",
        encoding: "utf8", rformat: "json", mobi: "1", issubtitle: "1",
        show_copyright_off: "1", pn: String(page - 1), rn: String(Math.min(count, 30)),
        all: query,
      });
      const data = await apiFetch(`http://www.kuwo.cn/search/searchMusicBykeyWord?${params}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      }, signal);
      const list: any[] = data?.abslist || [];
      const items: MusicTrack[] = list.map((s: any) => {
        // JaurusMusic 字段名: 大写 NAME/ARTIST/ALBUM/MUSICRID，兜底小写
        const rawRid = s.MUSICRID || s.musicrid || "";
        const rid = String(rawRid).replace("MUSIC_", "");
        const artist = s.ARTIST || s.artist || "";
        // 封面：web_albumpic_short / web_artistpic_short（参考 JaurusMusic）
        let cover = s.hts_MVPIC || s.albumpic || s.pic || "";
        if (!cover) {
          const alb = s.web_albumpic_short;
          const art = s.web_artistpic_short;
          if (alb && typeof alb === "string") cover = `https://img4.kuwo.cn/star/albumcover/${alb.replace("120", "500")}`;
          else if (art && typeof art === "string") cover = `https://img1.kuwo.cn/star/starheads/${art.replace("120", "500")}`;
        }
        return {
          id: `kw_${rid}`,
          name: s.NAME || s.name || s.songName || s.SONGNAME || "",
          artist: artist ? artist.split(/[、/&]/).map((a: string) => a.trim()).filter(Boolean) : [],
          album: s.ALBUM || s.album || "",
          pic_id: cover,
          url_id: rid,
          lyric_id: rid,
          source: "kuwo" as const,
        };
      });
      return { items, hasMore: items.length >= count };
    } catch { return { items: [], hasMore: false }; }
  };

  return {
    netease: new PlatformProvider({
      platform: "netease",
      searchImpl: neteaseSearch,
      sourceManager: getPlatformManager("netease"),
      getLyricImpl: fetchNeteaseLyric,
    }),
    qq: new PlatformProvider({
      platform: "qq",
      searchImpl: qqSearch,
      sourceManager: getPlatformManager("qq"),
      getLyricImpl: fetchQqLyric,
    }),
    kugou: new PlatformProvider({
      platform: "kugou",
      searchImpl: kugouSearch,
      sourceManager: getPlatformManager("kugou"),
      getLyricImpl: fetchKugouLyric,
    }),
    kuwo: new PlatformProvider({
      platform: "kuwo",
      searchImpl: kuwoSearch,
      sourceManager: getPlatformManager("kuwo"),
      getLyricImpl: fetchKuwoLyric,
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
