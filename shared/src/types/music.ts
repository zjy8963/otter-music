import type { NeteasePrivilege } from "./netease";

export interface SearchResult {
  code: number;
  data: MusicTrack[];
  error?: string;
}

export interface SongUrl {
  url: string;
  br: number;
  size: number;
}

export interface SongPic {
  url: string;
}

export interface SongLyric {
  lyric: string;
  tlyric?: string;
  /** 逐字原文歌词（优先使用，存在时表示逐字模式） */
  orig?: LyricLine[];
  /** 逐字翻译歌词 */
  ts?: LyricLine[];
  /** 逐字罗马音 */
  roma?: LyricLine[];
  /** 罗马音歌词文本 (向后兼容) */
  roma_lrc?: string;
  /** 元数据标签 */
  tags?: Record<string, string>;
}

/** 单个字/词的时间与文本 */
export interface LyricWord {
  start: number;
  end: number;
  text: string;
}

/** 一行歌词 */
export interface LyricLine {
  start: number;
  end: number;
  words: LyricWord[];
}

/** 逐字歌词单词（与 LyricWord 相同结构，用于渲染） */
export interface VerbateWord {
  start: number;
  end: number;
  text: string;
}

/** 逐字歌词行（与 LyricLine 相同结构，用于渲染） */
export interface VerbateLine {
  start: number;
  end: number;
  words: VerbateWord[];
}

export type MergedMusicTrack = MusicTrack & {
  variants?: MusicTrack[];
};

export type AudioFormat = "mp3" | "m4a" | "m4s" | "flv";

export interface SearchPageResult<T = MusicTrack> {
  items: T[];
  hasMore: boolean;
}

export const searchOptions: Record<string, string> = {
  all: "聚合搜索",
  netease: "网易云音乐",
  qq: "QQ音乐",
  kugou: "酷狗音乐",
  kuwo: "酷我音乐",
  bilibili: "B站",
  migu: "Migu",
  joox: "Joox",
  // 保留旧选项以兼容
  _netease: "Netease",
  lx_kuwo: "小蜗音乐",
  lx_qq: "小秋音乐",
};

export const sourceLabels: Record<string, string> = {
  joox: "Joox",
  netease: "网易",
  _netease: "Netease",
  kuwo: "酷我",
  kugou: "酷狗",
  migu: "Migu",
  bilibili: "B站",
  qq: "QQ",
  lx_kuwo: "小蜗",
  lx_qq: "小秋",
};

export const aggregatedSourceOptions: {
  value: MusicSource;
  label: string;
  description: string;
}[] = [
  {
    value: "netease",
    label: "网易云音乐",
    description: "音源稳定，小众资源多",
  },
  {
    value: "qq",
    label: "QQ音乐",
    description: "版权最全，音质上限高",
  },
  {
    value: "kugou",
    label: "酷狗音乐",
    description: "曲库互补，老歌资源多",
  },
  {
    value: "kuwo",
    label: "酷我音乐",
    description: "免费资源丰富",
  },
  {
    value: "bilibili",
    label: "B站",
    description: "Bilibili官方, 用户上传资源丰富",
  },
  { value: "migu", label: "Migu", description: "咪咕音乐官方" },
  {
    value: "joox",
    label: "Joox",
    description: "QQ音乐海外版",
  },
  // 保留旧选项以兼容
  { value: "_netease", label: "Netease", description: "网易云官方，稳定高速" },
  { value: "lx_kuwo", label: "小蜗音乐", description: "酷我音源（洛雪）" },
  { value: "lx_qq", label: "小秋音乐", description: "QQ音源（洛雪）" },
];

export const sourceBadgeStyles: Record<string, string> = {
  netease: "text-red-500/70 border-red-500/20 bg-red-500/5 hover:bg-red-500/10",
  _netease:
    "text-red-500/70 border-red-500/20 bg-red-500/5 hover:bg-red-500/10",
  kuwo: "text-amber-500/70 border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10",
  joox: "text-green-500/70 border-green-500/20 bg-green-500/5 hover:bg-green-500/10",

  qq: "text-yellow-500/70 border-yellow-500/20 bg-yellow-500/5 hover:bg-yellow-500/10",
  kugou: "text-sky-500/70 border-sky-500/20 bg-sky-500/5 hover:bg-sky-500/10",
  migu: "text-pink-500 border-pink-500/30 bg-pink-500/5 hover:bg-pink-500/10",
  bilibili:
    "text-pink-500/70 border-pink-500/20 bg-pink-500/5 hover:bg-pink-500/10",
  lx_kuwo:
    "text-amber-500/70 border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10",
  lx_qq:
    "text-yellow-500/70 border-yellow-500/20 bg-yellow-500/5 hover:bg-yellow-500/10",
  default:
    "text-muted-foreground/70 border-border bg-muted/30 hover:bg-muted/50",
};

export interface SourceConfig {
  source: MusicSource;
  enabled: boolean;
  visible: boolean;
}

export const DEFAULT_SOURCE_CONFIGS: SourceConfig[] = [
  { source: "netease", enabled: true, visible: true },
  { source: "qq", enabled: true, visible: true },
  { source: "kugou", enabled: true, visible: true },
  { source: "kuwo", enabled: false, visible: true },
  { source: "bilibili", enabled: true, visible: true },
  { source: "migu", enabled: false, visible: true },
  { source: "joox", enabled: false, visible: true },
  { source: "_netease", enabled: false, visible: true },
  { source: "lx_kuwo", enabled: false, visible: true },
  { source: "lx_qq", enabled: false, visible: true },
];

export type MusicSource =
  | "netease"
  | "_netease"
  | "joox"
  | "tencent"
  | "kugou"
  | "kuwo"
  | "bilibili"
  | "migu"
  | "qq"
  | "fivesing"
  | "tk"
  | "wy"
  | "kg"
  | "kw"
  | "mg"
  | "qi"
  | "lizhi"
  | "qingting"
  | "ximalaya"
  | "xiaoyuzhou"
  | "podcast"
  | "tidal"
  | "spotify"
  | "ytmusic"
  | "qobuz"
  | "deezer"
  | "apple"
  | "all"
  | "local"
  | "lx_kuwo"
  | "lx_qq";

export interface SearchIntent {
  type: "artist" | "album" | "playlist" | "";
  id?: string;
  name?: string;
  artist?: string;
}

export interface SearchSuggestionItem {
  id?: string;
  text: string;
  type: "song" | "artist" | "album" | "playlist";
  source?: MusicSource;
}

export interface MusicTrack {
  id: string;
  name: string;
  artist: string[];
  album: string;
  pic_id: string;
  url_id: string;
  lyric_id: string;
  source: MusicSource;
  /** 歌词来源平台覆盖（跨平台歌词匹配后设置）。
   *  存在时，getLyric 使用此字段而非 source 决定从哪个平台获取歌词。 */
  lyric_source?: MusicSource;
  update_time?: number;
  is_deleted?: boolean;
  privilege?: NeteasePrivilege;
  fee?: number; // 通用付费标识（0=免费, 1=VIP, 4=付费）
  artist_ids?: string[];
  album_id?: string;
  audioFormat?: AudioFormat;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: MusicTrack[];
  createdAt: number;
  update_time?: number;
  is_deleted?: boolean;
  coverUrl?: string;
  description?: string;
}

export interface LocalMusicTrack extends MusicTrack {
  localPath: string;
  fileSize?: number;
  lastModified?: number;
}

export interface MusicStoreData {
  favorites: MusicTrack[];
  playlists: Playlist[];
  queue: MusicTrack[];
  originalQueue?: MusicTrack[];
  currentIndex: number;
  volume: number;
  isRepeat: boolean;
  isShuffle: boolean;
  quality: string;
  searchSource: MusicSource;
  updatedAt?: number;
}
