// ============================================================
// 歌词匹配抽屉
//
// 歌名 + 歌手分两栏输入。歌名用于实际搜索，
// 歌手用于辅助匹配打分。歌名无相似的结果直接丢弃。
// ============================================================

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { useMusicStore } from "@/store/music-store";
import { useLyricsMatchStore, LYRIC_CAPABLE_PLATFORMS } from "@/store";
import { useShallow } from "zustand/react/shallow";
import {
  sourceLabels,
  sourceBadgeStyles,
  type MusicTrack,
  type MusicSource,
  type SongLyric,
} from "@/types/music";
import {
  Search,
  X,
  Check,
  AlignJustify,
  RotateCw,
  Music,
} from "lucide-react";
import { normalizeText } from "@/lib/utils/music-key";
import { MusicProviderFactory } from "@/lib/music-provider";

// ============================================================
// 类型
// ============================================================

export interface LyricsMatchResult {
  lyricId: string;
  lyricSource: MusicSource;
  lyricMode: "word" | "line";
  matchedName: string;
  matchedArtist: string;
}

interface LyricsMatchDrawerProps {
  track: MusicTrack;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (result: LyricsMatchResult) => void;
  hasMatchedLyric: boolean;
  onRestoreOriginal: () => void;
}

interface SearchResultItem {
  track: MusicTrack;
  tier: number;
  matchScore: number;
  duration?: number;
}

// ============================================================
// 匹配打分
// ============================================================

const PER_PLATFORM_COUNT = 20;

/**
 * 以歌名为搜索主体，歌手辅助打分。
 * 歌名完全无交集 → 丢弃。
 *
 * 层级：
 *   tier 1 — 歌名高度匹配（完全一致/前缀/高词级重叠）
 *   tier 2 — 歌名中等相似
 *   tier 3 — 歌名弱相似（至少一个词匹配）
 *   排除   — 歌名与搜索词无任何交集，或仅有歌手匹配歌名不沾边
 */
function computeRelevance(
  track: MusicTrack,
  songQuery: string,
  artistQuery: string,
  originalIndex: number
): { tier: number; score: number } | null {
  const sq = normalizeText(songQuery);
  const aq = normalizeText(artistQuery);
  const name = normalizeText(track.name);
  const artist = normalizeText(track.artist.join(" "));

  const sqWords = sq.split(/\s+/).filter((w) => w.length > 0);
  const nameWords = name.split(/\s+/).filter((w) => w.length > 0);

  // ---- 歌名相似度 ----
  const nameExact = name === sq;
  const nameStarts = !nameExact && sq && name.startsWith(sq);
  const nameContains = !nameExact && !nameStarts && sq && name.includes(sq);

  let nameWordExact = 0, nameWordPrefix = 0, nameWordSubstr = 0;
  if (!nameExact && !nameStarts && !nameContains && sq) {
    for (const w of sqWords) {
      if (nameWords.some((nw) => nw === w)) nameWordExact++;
      else if (nameWords.some((nw) => nw.startsWith(w))) nameWordPrefix++;
      else if (name.includes(w)) nameWordSubstr++;
    }
  }
  const totalHits = nameWordExact + nameWordPrefix + nameWordSubstr;
  const nameSim: number =
    !sq ? 0 :
    nameExact ? 1.0 :
    nameStarts ? 0.9 :
    nameContains ? 0.7 :
    sqWords.length > 0 ? totalHits / sqWords.length :
    0;

  // 歌名完全无交集 → 丢弃
  if (nameSim === 0) return null;

  // ---- 歌手匹配 ----
  const artistExact = aq && artist === aq;
  const artistContains = !artistExact && aq && artist.includes(aq);
  let artistWordHits = 0;
  if (aq && !artistExact && !artistContains) {
    for (const w of aq.split(/\s+/).filter(Boolean)) {
      if (artist.includes(w)) artistWordHits++;
    }
  }
  const artistMatch = artistExact || artistContains || artistWordHits > 0;

  // ---- 分层 ----
  // tier 1 完全匹配：歌名完全一致 AND 歌手完全一致
  // tier 2 歌名匹配：歌名高度相似，或歌名一致但歌手不对
  // tier 3 部分匹配：其余有歌名交集的结果
  let tier: number;
  if (nameExact && artistExact) {
    tier = 1;
  } else if (nameSim >= 0.7 || (nameSim >= 0.5 && artistMatch)) {
    tier = 2;
  } else {
    tier = 3;
  }

  // ---- 综合评分（同层内排序用） ----
  let score = 0;
  score += nameSim * 100;
  if (artistExact) score += 40;
  else if (artistContains) score += 22;
  else score += artistWordHits * 8;
  score += Math.max(0, 12 - originalIndex * 0.8);

  return { tier, score };
}

// ============================================================
// 组件
// ============================================================

export function LyricsMatchDrawer({
  track,
  open,
  onOpenChange,
  onConfirm,
  hasMatchedLyric,
  onRestoreOriginal,
}: LyricsMatchDrawerProps) {
  const defaultSong = track.name.trim();
  const defaultArtist = track.artist.join(" ").trim();

  const [songQuery, setSongQuery] = useState("");
  const [artistQuery, setArtistQuery] = useState("");
  const [songInput, setSongInput] = useState("");
  const [artistInput, setArtistInput] = useState("");

  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(null);
  const [previewLyric, setPreviewLyric] = useState<SongLyric | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const globalSourceConfigs = useMusicStore((s) => s.sourceConfigs);
  const { disabledPlatforms, togglePlatform } = useLyricsMatchStore(
    useShallow((s) => ({
      disabledPlatforms: s.disabledPlatforms,
      togglePlatform: s.togglePlatform,
    }))
  );

  const availablePlatforms = useMemo(() => {
    const globalEnabled = globalSourceConfigs
      .filter((c) => c.enabled)
      .map((c) => c.source);
    return LYRIC_CAPABLE_PLATFORMS.filter((p) => globalEnabled.includes(p));
  }, [globalSourceConfigs]);

  const enabledPlatforms = useMemo(() => {
    return availablePlatforms.filter((p) => !disabledPlatforms.includes(p));
  }, [availablePlatforms, disabledPlatforms]);

  const abortRef = useRef<AbortController | null>(null);

  // 打开时重置
  useEffect(() => {
    if (open) {
      setSongQuery(defaultSong);
      setArtistQuery(defaultArtist);
      setSongInput(defaultSong);
      setArtistInput(defaultArtist);
      setResults([]);
      setHasSearched(false);
      setSelectedTrack(null);
      setPreviewLyric(null);
      setPreviewError(null);
    }
  }, [open, defaultSong, defaultArtist]);

  // ========== 搜索 ==========

  const doSearch = useCallback(async () => {
    const sq = songQuery.trim();
    if (!sq || enabledPlatforms.length === 0) return;

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setIsSearching(true);
    setHasSearched(true);
    setSelectedTrack(null);
    setPreviewLyric(null);
    setPreviewError(null);

    const platformResults = new Map<MusicSource, MusicTrack[]>();

    // 用歌名进行搜索
    const promises = enabledPlatforms.map(async (source) => {
      try {
        const provider = MusicProviderFactory.getProvider(source);
        const res = await provider.search(sq, 1, PER_PLATFORM_COUNT, abort.signal);
        if (!abort.signal.aborted && res.items?.length) {
          platformResults.set(source, res.items);
        }
      } catch (e) {
        logger.warn("LyricsMatch", `[${source}] search failed`, e);
      }
    });

    await Promise.allSettled(promises);
    if (abort.signal.aborted) return;

    // 打分 + 分层（歌手辅助匹配）
    const aq = artistQuery.trim();
    const allScored: (SearchResultItem & { source: MusicSource })[] = [];
    for (const [source, tracks] of platformResults) {
      for (let i = 0; i < tracks.length; i++) {
        const rel = computeRelevance(tracks[i], sq, aq, i);
        if (!rel) continue;
        allScored.push({
          track: tracks[i],
          tier: rel.tier,
          matchScore: rel.score,
          source,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          duration: (tracks[i] as any).duration as number | undefined,
        });
      }
    }

    // 排序：tier 升序 → score 降序
    allScored.sort((a, b) => a.tier - b.tier || b.matchScore - a.matchScore);

    // 平台多样性 round-robin
    const byPlatform = new Map<MusicSource, typeof allScored>();
    for (const item of allScored) {
      const arr = byPlatform.get(item.source) || [];
      arr.push(item);
      byPlatform.set(item.source, arr);
    }

    const interleaved: SearchResultItem[] = [];
    const seen = new Set<string>();
    let round = 0;
    let added = true;
    while (added) {
      added = false;
      for (const [, items] of byPlatform) {
        if (round < items.length) {
          const item = items[round];
          const key = `${item.source}:${item.track.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            interleaved.push({
              track: item.track,
              tier: item.tier,
              matchScore: item.matchScore,
              duration: item.duration,
            });
          }
          added = true;
        }
      }
      round++;
    }

    logger.info("LyricsMatch", `Filtered: ${allScored.length} → ${interleaved.length}`);
    setResults(interleaved);
    setIsSearching(false);
  }, [songQuery, artistQuery, enabledPlatforms]);

  const doSearchRef = useRef(doSearch);
  doSearchRef.current = doSearch;

  // 关键词或平台变化时重新搜索
  useEffect(() => {
    if (open && songQuery.trim()) {
      doSearchRef.current();
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [open, songQuery, artistQuery, enabledPlatforms]);

  // ========== 手动搜索 ==========

  const triggerSearch = useCallback(() => {
    setSongQuery(songInput.trim());
    setArtistQuery(artistInput.trim());
  }, [songInput, artistInput]);

  // ========== 预览 ==========

  const handleSelectTrack = useCallback(async (item: MusicTrack) => {
    setSelectedTrack(item);
    setPreviewLyric(null);
    setPreviewError(null);
    setIsLoadingPreview(true);

    try {
      const provider = MusicProviderFactory.getProvider(item.source);
      const lyric = await provider.getLyric(item);
      logger.info("LyricsMatch", `Preview: ${item.source}/${item.name}`, {
        hasOrig: !!lyric?.orig?.length,
        hasWords: lyric?.orig?.some((l) => l.words?.length > 1),
      });
      setPreviewLyric(lyric);
    } catch (e) {
      logger.error("LyricsMatch", "Preview failed", e);
      setPreviewError("歌词加载失败，请重试");
      setPreviewLyric(null);
    } finally {
      setIsLoadingPreview(false);
    }
  }, []);

  // ========== 确认 ==========

  const lyricMode: "word" | "line" = useMemo(() => {
    if (!previewLyric) return "line";
    return (previewLyric.orig?.length ?? 0) > 0 &&
      (previewLyric.orig ?? []).some((l) => (l.words?.length ?? 0) > 1)
      ? "word"
      : "line";
  }, [previewLyric]);

  const handleConfirm = useCallback(() => {
    if (!selectedTrack) return;
    onConfirm({
      lyricId: selectedTrack.lyric_id || selectedTrack.id,
      lyricSource: selectedTrack.source,
      lyricMode,
      matchedName: selectedTrack.name,
      matchedArtist: selectedTrack.artist.join(" / "),
    });
    onOpenChange(false);
  }, [selectedTrack, lyricMode, onConfirm, onOpenChange]);

  // ========== 预览行 ==========

  const previewLines = useMemo(() => {
    if (!previewLyric?.lyric) return [];
    return previewLyric.lyric
      .split("\n")
      .filter((l) => l.trim() && /\[\d+:\d+/.test(l))
      .slice(0, 8)
      .map((l) => l.replace(/\[\d+:\d+\.\d+\]/g, "").trim())
      .filter(Boolean);
  }, [previewLyric]);

  const formatDur = (ms?: number): string => {
    if (!ms || ms <= 0) return "";
    const sec = Math.floor(ms / 1000);
    const mm = Math.floor(sec / 60);
    return `${mm}:${(sec % 60).toString().padStart(2, "0")}`;
  };

  const tierLabel = useCallback((tier: number) => {
    if (tier === 1) return { text: "完全匹配", cls: "text-green-600 bg-green-50 border-green-200" };
    if (tier === 2) return { text: "歌名匹配", cls: "text-blue-600 bg-blue-50 border-blue-200" };
    return { text: "部分匹配", cls: "text-muted-foreground bg-muted border-border" };
  }, []);

  // ========== 渲染 ==========

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[85vh] flex flex-col">
        <DrawerHeader className="flex flex-row items-center justify-between px-4 py-3 border-b shrink-0">
          <DrawerTitle className="text-lg">歌词匹配</DrawerTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </DrawerHeader>

        {/* 搜索栏 — 歌名 + 歌手分开 */}
        <div className="px-4 py-3 flex gap-2 shrink-0">
          <div className="flex-1 flex flex-col gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={songInput}
                onChange={(e) => setSongInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") triggerSearch(); }}
                placeholder="歌名"
                className="pl-9 pr-8"
              />
              {songInput && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setSongInput("")}
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>
            <div className="relative">
              <Music className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={artistInput}
                onChange={(e) => setArtistInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") triggerSearch(); }}
                placeholder="歌手（辅助匹配）"
                className="pl-9 pr-8"
              />
              {artistInput && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setArtistInput("")}
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
          <Button
            size="icon"
            variant="secondary"
            className="h-10 w-10 shrink-0 self-end"
            onClick={triggerSearch}
            disabled={isSearching || !songInput.trim()}
          >
            {isSearching ? <Spinner className="h-4 w-4" /> : <RotateCw className="h-4 w-4" />}
          </Button>
        </div>

        {/* 平台筛选 + 恢复 */}
        <div className="px-4 pb-2 shrink-0 space-y-1.5">
          {availablePlatforms.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-muted-foreground mr-1">搜索平台：</span>
              {availablePlatforms.map((source) => {
                const isEnabled = enabledPlatforms.includes(source);
                return (
                  <button
                    key={source}
                    onClick={() => togglePlatform(source)}
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors border",
                      isEnabled
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-muted border-border text-muted-foreground line-through"
                    )}
                  >
                    {sourceLabels[source] || source}
                    {isEnabled && <Check className="ml-1 h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          )}
          {hasMatchedLyric && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground h-7"
              onClick={() => { onRestoreOriginal(); onOpenChange(false); }}
            >
              <RotateCw className="mr-1 h-3 w-3" />
              恢复原始歌词
            </Button>
          )}
        </div>

        {/* 搜索结果 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4">
          {isSearching ? (
            <div className="flex items-center justify-center py-12">
              <Spinner className="h-6 w-6 mr-2" />
              <span className="text-sm text-muted-foreground">正在搜索...</span>
            </div>
          ) : !hasSearched ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Search className="h-8 w-8 mb-2 opacity-30" />
              <span className="text-sm">输入歌名后点击搜索</span>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <AlignJustify className="h-8 w-8 mb-2 opacity-30" />
              <span className="text-sm">未找到匹配歌词，请调整搜索词</span>
            </div>
          ) : (
            <div className="space-y-1 pb-4">
              <div className="text-xs text-muted-foreground py-2 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                搜索结果 ({results.length}条)
              </div>
              {results.map(({ track: t, tier, duration }) => {
                const isSelected = selectedTrack?.id === t.id && selectedTrack?.source === t.source;
                const tl = tierLabel(tier);
                return (
                  <button
                    key={`${t.source}:${t.id}`}
                    onClick={() => handleSelectTrack(t)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                      isSelected
                        ? "bg-primary/10 border border-primary/30"
                        : "hover:bg-muted border border-transparent"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{t.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {t.artist.join(" / ")}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {duration ? (
                        <span className="text-[10px] text-muted-foreground/70 w-8 text-right">
                          {formatDur(duration)}
                        </span>
                      ) : null}
                      {(
                        <Badge variant="outline" className={cn("text-[9px] px-1 py-0 h-4 border", tl.cls)}>
                          {tl.text}
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-0 h-5",
                          sourceBadgeStyles[t.source] || sourceBadgeStyles.default
                        )}
                      >
                        {sourceLabels[t.source] || t.source}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 歌词预览 & 确认 */}
        {selectedTrack && (
          <div className="border-t bg-muted/30 px-4 py-3 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <Music className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate max-w-[180px]">
                  {selectedTrack.name}
                </span>
                {isLoadingPreview ? (
                  <Spinner className="h-3 w-3 shrink-0" />
                ) : previewLyric ? (
                  <Badge
                    variant={lyricMode === "word" ? "default" : "secondary"}
                    className="text-[10px] px-1.5 py-0 h-5 shrink-0"
                  >
                    {lyricMode === "word" ? "逐字" : "逐行"}
                  </Badge>
                ) : null}
              </div>
              <Button
                size="sm"
                onClick={handleConfirm}
                disabled={!previewLyric || isLoadingPreview}
                className="h-7 text-xs shrink-0"
              >
                <Check className="mr-1 h-3 w-3" />
                使用此歌词
              </Button>
            </div>
            {isLoadingPreview ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Spinner className="h-3 w-3" /> 加载歌词中...
              </div>
            ) : previewError ? (
              <div className="text-xs text-destructive py-1">{previewError}</div>
            ) : previewLyric ? (
              <div className="space-y-0.5">
                {previewLines.length > 0 ? (
                  previewLines.map((line, i) => (
                    <div key={i} className="text-xs text-muted-foreground leading-relaxed">
                      {line}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-muted-foreground">（纯音乐或无歌词文本）</div>
                )}
                {previewLines.length > 0 && (
                  <div className="text-[10px] text-muted-foreground/50 pt-1">
                    预览前 {previewLines.length} 行...
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-destructive">该歌曲暂无歌词，试试其他结果</div>
            )}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
