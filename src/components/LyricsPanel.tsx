"use client";

import { memo, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { musicApi } from "@/lib/music-api";
import { MusicTrack, VerbateWord, SongLyric } from "@/types/music";
import { Play } from "lucide-react";
import { useMusicStore } from "@/store/music-store";
import { useShallow } from "zustand/react/shallow";

interface LyricsPanelProps {
  track: MusicTrack | null;
  active?: boolean;
}

// ============================================================
// 数据模型
// ============================================================

interface CharSlot {
  char: string;
  startMs: number;
  durationMs: number;
}

interface GradientLine {
  startMs: number;
  endMs: number;
  /** 下一行开始时间，用于缩放回退 */
  nextStartMs: number;
  chars: CharSlot[];
  ttext?: string;
}

// ============================================================
// 动画常量
// ============================================================

const SCALE_UP_DURATION   = 150;
const SCALE_DOWN_DURATION = 150;
const HOLD_FULL_DURATION  = 300;   // 全亮保留 300ms
const FADE_DURATION       = 200;   // 熄灭扫过 200ms
const MAX_SCALE           = 1.25;  // 最大放大 1.25x

// ============================================================
// 工具
// ============================================================

const TIME_EXP = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
const AUTO_SCROLL_DELAY = 2000;
const PADDING_LINES = 2;

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function wordsToCharSlots(words: VerbateWord[]): CharSlot[] {
  const slots: CharSlot[] = [];
  for (const w of words) {
    const chars = [...w.text];
    if (chars.length === 0) continue;
    const dur = Math.max((w.end - w.start) / chars.length, 1);
    for (let ci = 0; ci < chars.length; ci++)
      slots.push({ char: chars[ci], startMs: w.start + ci * dur, durationMs: dur });
  }
  return slots;
}

function textToCharSlots(text: string, L: number, R: number): CharSlot[] {
  const chars = [...text];
  if (chars.length === 0) return [];
  const dur = Math.max((R - L) / chars.length, 1);
  return chars.map((c, i) => ({ char: c, startMs: L + i * dur, durationMs: dur }));
}

function parseLrcToTimeText(lrc: string): { timeMs: number; text: string }[] {
  const out: { timeMs: number; text: string }[] = [];
  for (const line of lrc.split("\n")) {
    const m = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
    if (m) {
      const ms = parseInt(m[1]) * 60000 + parseInt(m[2]) * 1000 + parseInt(m[3].padEnd(3, "0"));
      const text = m[4].trim();
      if (text) out.push({ timeMs: ms, text });
    }
  }
  return out;
}

// ============================================================
// API → GradientLine[]
// ============================================================

function verbateToGradientLines(res: SongLyric): GradientLine[] {
  const origLines = res.orig ?? [];
  const tsLines = res.ts ?? [];
  const tlyricLines = res.tlyric ? parseLrcToTimeText(res.tlyric) : [];
  let tlyricIdx = 0;
  const raw: Omit<GradientLine, "nextStartMs">[] = [];

  for (let i = 0; i < origLines.length; i++) {
    const line = origLines[i];
    if (!line.words || line.words.every((w) => !w.text.trim())) continue;
    const filtered = line.words.filter((w) => w.text !== "\r");
    for (let j = 0; j < filtered.length - 1; j++)
      if (!filtered[j].end || filtered[j].end === filtered[j].start)
        filtered[j] = { ...filtered[j], end: filtered[j + 1].start };
    const last = filtered[filtered.length - 1];
    if (last && (!last.end || last.end === last.start))
      filtered[filtered.length - 1] = { ...last, end: line.end || last.start + 500 };
    const lineEnd = line.end || filtered[filtered.length - 1]?.end || line.start + 2000;

    let ttext: string | undefined;
    if (tsLines[i]) {
      ttext = tsLines[i].words.map((w) => w.text).join("").trim() || undefined;
    } else if (tlyricLines.length > 0) {
      while (tlyricIdx < tlyricLines.length && tlyricLines[tlyricIdx].timeMs < line.start - 800) tlyricIdx++;
      if (tlyricIdx < tlyricLines.length && Math.abs(tlyricLines[tlyricIdx].timeMs - line.start) <= 800) {
        ttext = tlyricLines[tlyricIdx].text || undefined;
        tlyricIdx++;
      }
    }
    raw.push({ startMs: line.start, endMs: lineEnd, chars: wordsToCharSlots(filtered), ttext });
  }
  return raw.map((item, i) => ({ ...item, nextStartMs: raw[i + 1]?.startMs ?? item.endMs + 700 }));
}

function simpleToGradientLines(lrc: string, tLrc?: string): GradientLine[] {
  const tt = parseLrcToTimeText(lrc);
  if (tt.length === 0) return [];
  const lines = tt.map((item, i) => ({
    startMs: item.timeMs,
    endMs: tt[i + 1]?.timeMs ?? item.timeMs + 3000,
    text: item.text,
  }));
  const tItems = tLrc ? parseLrcToTimeText(tLrc) : [];
  let tIdx = 0;
  const raw: Omit<GradientLine, "nextStartMs">[] = lines.map((line) => {
    let ttext: string | undefined;
    while (tIdx < tItems.length && tItems[tIdx].timeMs < line.startMs - 400) tIdx++;
    if (tIdx < tItems.length && Math.abs(tItems[tIdx].timeMs - line.startMs) <= 800) {
      ttext = tItems[tIdx].text || undefined;
      tIdx++;
    }
    return { startMs: line.startMs, endMs: line.endMs, chars: textToCharSlots(line.text, line.startMs, line.endMs), ttext };
  });
  return raw.map((item, i) => ({ ...item, nextStartMs: raw[i + 1]?.startMs ?? item.endMs + 700 }));
}

// ============================================================
// GradientLineView — 完整状态机
// ============================================================


/** easeOutBack — 回弹缓动，q弹效果 */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

const GradientLineView = memo(function GradientLineView({ line }: { line: GradientLine }) {
  const charRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const cRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number>(0);
  const prevFillRef = useRef<number[]>([]);

  useEffect(() => {
    const chars = line.chars;
    const n = chars.length;
    const L = line.startMs;
    const R = line.endMs;
    const N = line.nextStartMs;

    if (prevFillRef.current.length !== n) prevFillRef.current = new Array(n).fill(0);

    const setCharFill = (i: number, pct: number) => {
      const el = charRefs.current[i];
      if (!el) return;
      const prev = prevFillRef.current[i] ?? 0;
      const eased = prev + (pct - prev) * 0.3;
      prevFillRef.current[i] = eased;
      el.style.setProperty("--fill", `${eased.toFixed(3)}%`);
    };

    const update = () => {
      const audioEl = document.querySelector("audio");
      const now = (audioEl?.currentTime ?? 0) * 1000;
      const c = cRef.current;

      // ── 缩放 ──
      const upEnd   = L + SCALE_UP_DURATION;
      const dnStart = N;
      const dnEnd   = N + SCALE_DOWN_DURATION;
      let scale: number, opacity: number;
      if (now < L)                      { scale = 1;     opacity = 0.35; }
      else if (now < upEnd)             { const t = Math.min(1, (now - L) / SCALE_UP_DURATION); const e = easeOutBack(t); scale = 1 + (MAX_SCALE - 1) * e; opacity = 0.35 + 0.65 * t; }
      else if (now < dnStart)           { scale = MAX_SCALE;                              opacity = 1; }
      else if (now < dnEnd)             { const t = Math.min(1, (now - dnStart) / SCALE_DOWN_DURATION); const e = easeOutBack(t); scale = MAX_SCALE - (MAX_SCALE - 1) * e; opacity = 1; }
      else                              { scale = 1;                                      opacity = 0.55; }

      if (c) { c.style.transform = `scale(${scale.toFixed(4)})`; c.style.opacity = opacity.toFixed(3); }

      // ── 高亮 + 从下至上熄灭 ──
      const holdEnd = Math.max(R + HOLD_FULL_DURATION, N + HOLD_FULL_DURATION);
      if (now >= holdEnd) {
        // 保留结束，直接熄灭
        for (let i = 0; i < n; i++) setCharFill(i, 0);
      } else {
        // 填充 + 保留期
        for (let i = 0; i < n; i++) {
          const ch = chars[i];
          if (now >= ch.startMs + ch.durationMs) setCharFill(i, 100);
          else if (now < ch.startMs) setCharFill(i, 0);
          else setCharFill(i, Math.max(0, Math.min(100, ((now - ch.startMs) / ch.durationMs) * 100)));
        }
      }

      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const c = cRef.current;
      if (c) { c.style.transform = ""; c.style.opacity = ""; }
      for (let i = 0; i < n; i++) { const el = charRefs.current[i]; if (el) el.style.setProperty("--fill", "0%"); }
    };
  }, [line]);

  return (
    <div ref={cRef} className="px-6 sm:px-12 w-full max-w-lg text-center cursor-pointer">
      <p className="text-lg font-medium leading-8 min-h-8 tracking-wide break-words whitespace-normal">
        {line.chars.map((ch, i) => (
          <span key={i} ref={(el) => { charRefs.current[i] = el; }}
            style={{
              background: "linear-gradient(to right, white var(--fill), rgba(255,255,255,0.2) var(--fill))",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              backgroundClip: "text", color: "transparent",
            }}
          >{ch.char}</span>
        ))}
      </p>
      {line.ttext && <p className="mt-3 font-medium text-[15px] break-words text-white/35">{line.ttext}</p>}
    </div>
  );
});

// ============================================================
// 主组件
// ============================================================

export function LyricsPanel({ track, active = true }: LyricsPanelProps) {
  const [gradientLines, setGradientLines] = useState<GradientLine[]>([]);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [centerLineIndex, setCenterLineIndex] = useState(-1);

  const { currentTime, seek, seekTimestamp } = useMusicStore(
    useShallow((state) => ({ currentTime: state.currentAudioTime, seek: state.seek, seekTimestamp: state.seekTimestamp }))
  );

  const currentTimeMs = currentTime * 1000;

  // 滚动跟进行: 当前句完全高亮 (endMs) 后自动滚动到下一句
  const SCROLL_ADVANCE = 750; // 在下一句开始唱之前 750ms 提前滚到该句
  const activeIndex = useMemo(() => {
    if (gradientLines.length === 0) return 0;
    return Math.max(0, gradientLines.findLastIndex((l) => currentTimeMs >= l.startMs - SCROLL_ADVANCE));
  }, [gradientLines, currentTimeMs]);

  const hasContent = gradientLines.length > 0;
  const trackId = track?.id ?? null;
  const lyricId = track?.lyric_id ?? null;
  const source = track?.source ?? null;

  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAutoScrollingRef = useRef(false);

  const handleSeek = useCallback((time: number) => {
    seek(time); setIsUserScrolling(false); setCenterLineIndex(-1);
    if (scrollTimeoutRef.current) { clearTimeout(scrollTimeoutRef.current); scrollTimeoutRef.current = null; }
  }, [seek]);

  const handleScroll = useCallback(() => {
    if (isAutoScrollingRef.current) return;
    setIsUserScrolling(true);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => { setIsUserScrolling(false); setCenterLineIndex(-1); }, AUTO_SCROLL_DELAY);
    const c = viewportRef.current;
    if (!c || gradientLines.length === 0) return;
    const rc = c.getBoundingClientRect(); const cc = rc.top + rc.height / 2;
    let best = 0, bestD = Infinity;
    lineRefs.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - cc);
      if (d < bestD) { bestD = d; best = i; }
    });
    setCenterLineIndex(best);
  }, [gradientLines.length]);

  useEffect(() => {
    const c = viewportRef.current; if (!c) return;
    c.addEventListener("scroll", handleScroll, { passive: true });
    return () => c.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    if (!trackId || !source || !active) return;
    if (!lyricId) { queueMicrotask(() => { setLoading(false); setError("暂无歌词"); setGradientLines([]); }); return; }
    const abort = new AbortController(); let cancelled = false;
    musicApi.getLyric(lyricId, source, abort.signal)
      .then((res) => {
        if (cancelled) return;
        if (!res) { setError("暂无歌词"); return; }
        setGradientLines(
          res.orig && res.orig.length > 0 && res.orig.some(l => l.words && l.words.length > 1)
            ? verbateToGradientLines(res)
            : simpleToGradientLines(res.lyric, res.tlyric)
        );
      })
      .catch(() => { if (!cancelled) setError("歌词加载失败"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; abort.abort(); };
  }, [trackId, lyricId, source, active]);

  // 歌词首次加载时，立即滚到待放歌词位置
  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (gradientLines.length === 0 || didInitialScroll.current) return;
    const timer = setTimeout(() => {
      const idx = gradientLines.findLastIndex((l) => currentTimeMs >= l.startMs - SCROLL_ADVANCE);
      const target = Math.max(0, idx);
      const el = lineRefs.current[target];
      const c = viewportRef.current;
      if (el && c) {
        c.scrollTo({ top: Math.max(0, el.offsetTop - c.clientHeight / 2 + el.clientHeight / 2), behavior: "instant" });
        didInitialScroll.current = true;
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [hasContent]);

  useEffect(() => {
    if (isUserScrolling) return;
    const c = viewportRef.current; const el = lineRefs.current[Math.min(activeIndex, gradientLines.length - 1)];
    if (!c || !el) return;
    const offset = el.offsetTop - c.clientHeight / 2 + el.clientHeight / 2;
    isAutoScrollingRef.current = true;
    c.scrollTo({ top: offset, behavior: "smooth" });
    const onEnd = () => { isAutoScrollingRef.current = false; c.removeEventListener("scrollend", onEnd); };
    c.addEventListener("scrollend", onEnd, { once: true });
    return () => { isAutoScrollingRef.current = false; c.removeEventListener("scrollend", onEnd); };
  }, [activeIndex, isUserScrolling, gradientLines.length]);

  useEffect(() => {
    flushSync(() => { setIsUserScrolling(false); setCenterLineIndex(-1); });
    if (scrollTimeoutRef.current) { clearTimeout(scrollTimeoutRef.current); scrollTimeoutRef.current = null; }
  }, [seekTimestamp]);

  useEffect(() => () => { if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current); }, []);

  if (!track) return <div className="h-full flex items-center justify-center text-sm text-white/40 tracking-widest">选择歌曲查看歌词</div>;
  if (loading) return <div className="h-full flex items-center justify-center text-sm text-white/40 tracking-widest">加载歌词中...</div>;
  if (error) return <div className="h-full flex items-center justify-center text-sm text-white/40 tracking-widest">{error}</div>;

  const centerLine = centerLineIndex >= 0 ? gradientLines[centerLineIndex] : null;

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      <ScrollArea
        className="h-full w-full **:data-[slot=scroll-area-scrollbar]:w-1.5 **:data-[slot=scroll-area-thumb]:bg-white/10 **:data-[slot=scroll-area-thumb]:hover:bg-white/30"
        viewportRef={viewportRef}
        style={{ overflowX: "hidden", maskImage: "linear-gradient(to bottom, transparent 0%, black 15%, black 90%, transparent 100%)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 15%, black 90%, transparent 100%)" }}
      >
        <div className="py-[45%] space-y-10 flex flex-col items-center w-full">
          {!hasContent ? (
            <div className="h-full flex items-center justify-center"><p className="text-white/50 text-center tracking-widest">暂无歌词</p></div>
          ) : (
            <>
              {Array.from({ length: PADDING_LINES }).map((_, i) => <div key={`pt-${i}`} className="h-6" />)}
              {gradientLines.map((line, i) => (
                <div key={i} ref={(el) => { lineRefs.current[i] = el; }} className="w-full flex justify-center">
                  <GradientLineView line={line} />
                </div>
              ))}
              {Array.from({ length: PADDING_LINES }).map((_, i) => <div key={`pb-${i}`} className="h-6" />)}
            </>
          )}
        </div>
      </ScrollArea>
      {isUserScrolling && centerLine && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center px-3 pointer-events-none z-10">
          <span className="text-xs text-white/70 font-medium min-w-[40px] drop-shadow-md">{formatTime(centerLine.startMs / 1000)}</span>
          <div className="flex-1 h-px bg-white/30 mx-3 shadow-[0_0_8px_rgba(255,255,255,0.4)]" />
          <button onClick={(e) => { e.stopPropagation(); handleSeek(centerLine.startMs / 1000); }}
            className="pointer-events-auto w-8 h-8 flex bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full items-center justify-center transition-all active:scale-95 shadow-sm">
            <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
          </button>
        </div>
      )}
    </div>
  );
}
