// ============================================================
// PlatformSourceConfig — 实时测试 + 详情展示 + 开关左置
// ============================================================
"use client";

import { useState, useCallback } from "react";
import { Music, Loader2, CheckCircle2, XCircle, Circle, Play, GripVertical } from "lucide-react";
import type { MusicPlatform } from "@otter-music/shared";
import { INTERNAL_SOURCES_BY_PLATFORM, PLATFORM_LABELS } from "@otter-music/shared";
import { useSourceConfigStore } from "@/store/source-config-store";
import { testSingleSource } from "@/lib/music-provider/source-tester";
import { SettingItem } from "./SettingItem";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const CONCURRENCY = 8;

function StatusIcon({ status, testing }: { status: string | null; testing: boolean }) {
  if (testing) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === "fail" || status === "timeout") return <XCircle className="h-4 w-4 text-red-500" />;
  return <Circle className="h-4 w-4 text-muted-foreground/30" />;
}

// ─── 单个源行 ───
function SourceRow({ sourceId, platform, testingAll }: { sourceId: string; platform: MusicPlatform; testingAll: boolean }) {
  const { configs, setSourceEnabled, recordTestResult } = useSourceConfigStore();
  const [testing, setTesting] = useState(false);
  const source = INTERNAL_SOURCES_BY_PLATFORM[platform]?.find(s => s.id === sourceId);
  if (!source) return null;
  const cfg = configs[platform]?.[sourceId];
  const enabled = cfg?.enabled ?? true;
  const status = cfg?.lastTestResult ?? null;
  const isTesting = testing || testingAll;

  const handleTest = useCallback(async () => {
    setTesting(true);
    try {
      const r = await testSingleSource(sourceId);
      recordTestResult(sourceId, r.status, { format: r.format, size: r.size, durationMs: r.durationMs, error: r.error });
    } catch {
      recordTestResult(sourceId, "fail", { error: "exception" });
    } finally {
      setTesting(false);
    }
  }, [sourceId, recordTestResult]);

  return (
    <div className="flex items-center gap-2 py-1.5 px-1 text-[12px]">
      <Switch checked={enabled} onCheckedChange={() => setSourceEnabled(sourceId, !enabled)} className="scale-75 shrink-0" />
      <button className="shrink-0 hover:scale-110 transition-transform" onClick={handleTest} disabled={isTesting} title="点击测试">
        <StatusIcon status={status} testing={isTesting} />
      </button>
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className="font-medium text-foreground truncate">{source.label}</span>
        {source.tier === "official" && <span className="text-[10px] text-blue-400 bg-blue-400/5 px-1 rounded">官方</span>}
        {status === "ok" && (cfg?.testFormat || cfg?.testSize) && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {cfg.testFormat?.toUpperCase() || "?"} {cfg.testSize || ""} {cfg.testDurationMs ? `${cfg.testDurationMs}ms` : ""}
          </span>
        )}
        {status === "fail" && cfg?.testError && (
          <span className="text-[10px] text-red-400 truncate shrink-0 max-w-[140px]">{cfg.testError}</span>
        )}
      </div>
    </div>
  );
}

// ─── 排序 ───
function sortSources(platform: MusicPlatform, configs: any): string[] {
  const sources = INTERNAL_SOURCES_BY_PLATFORM[platform] || [];
  return [...sources].sort((a, b) => {
    const ca = configs[platform]?.[a.id], cb = configs[platform]?.[b.id];
    if (a.tier === "official" && b.tier !== "official") return -1;
    if (b.tier === "official" && a.tier !== "official") return 1;
    const ea = ca?.enabled ?? true, eb = cb?.enabled ?? true;
    if (ea && !eb) return -1;
    if (!ea && eb) return 1;
    const ha = ca?.lastTestResult === "ok" ? 1 : 0, hb = cb?.lastTestResult === "ok" ? 1 : 0;
    return hb - ha || a.priority - b.priority;
  }).map(s => s.id);
}

// ─── 并发测试 + 实时回调 ───
async function runConcurrent(tasks: (() => Promise<void>)[], concurrency: number) {
  const queue = [...tasks];
  async function worker() { while (queue.length) { const t = queue.shift(); if (t) await t(); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
}

// ─── 平台卡片 ───
function PlatformCard({ platform }: { platform: MusicPlatform }) {
  const [expanded, setExpanded] = useState(false);
  const { configs, recordTestResult } = useSourceConfigStore();
  const [testingAll, setTestingAll] = useState(false);
  const [testingEnabled, setTestingEnabled] = useState(false);
  const isTesting = testingAll || testingEnabled;
  const sources = INTERNAL_SOURCES_BY_PLATFORM[platform] || [];
  const sortedIds = sortSources(platform, configs);
  const stats = {
    total: sources.length,
    enabled: sources.filter(s => configs[platform]?.[s.id]?.enabled !== false).length,
    healthy: sources.filter(s => configs[platform]?.[s.id]?.lastTestResult === "ok").length,
  };

  const runTest = useCallback(async (onlyEnabled: boolean) => {
    if (onlyEnabled) setTestingEnabled(true); else setTestingAll(true);
    const ids = onlyEnabled ? sortedIds.filter(id => configs[platform]?.[id]?.enabled !== false) : sortedIds;
    const tasks = ids.map(id => async () => {
      try {
        const r = await testSingleSource(id);
        recordTestResult(id, r.status, { format: r.format, size: r.size, durationMs: r.durationMs, error: r.error });
      } catch { recordTestResult(id, "fail"); }
    });
    await runConcurrent(tasks, CONCURRENCY);
    if (onlyEnabled) setTestingEnabled(false); else setTestingAll(false);
  }, [platform, sortedIds, configs, recordTestResult]);

  return (
    <div className="rounded-xl bg-card/50 border border-border/50 overflow-hidden">
      <button className="w-full flex items-center gap-3 p-3 hover:bg-muted/20 transition-colors text-left" onClick={() => setExpanded(!expanded)}>
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Music className="h-4 w-4 text-primary" /></div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">{PLATFORM_LABELS[platform]}</span>
          <div className="text-[11px] text-muted-foreground">{stats.enabled}/{stats.total} 启用 · {stats.healthy} 存活</div>
        </div>
      </button>
      <div className={cn("grid transition-all duration-200", expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <div className="px-3 pb-3 border-t border-border/50">
            <div className="flex items-center gap-2 py-2">
              <button className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1" disabled={isTesting} onClick={() => runTest(false)}>
                {testingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}测试全部({sources.length})
              </button>
              <span className="text-muted-foreground/30">·</span>
              <button className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1" disabled={isTesting} onClick={() => runTest(true)}>
                {testingEnabled ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}仅已启用({stats.enabled})
              </button>
              <span className="text-[11px] text-muted-foreground ml-auto">并发{CONCURRENCY}</span>
            </div>
            <div className="space-y-0.5">
              {sortedIds.map(id => <SourceRow key={id} sourceId={id} platform={platform} testingAll={isTesting} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlatformSourceConfig() {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<MusicPlatform>("netease");
  const { liuyunKey, setLiuyunKey } = useSourceConfigStore();
  const platforms: MusicPlatform[] = ["netease", "qq", "kugou", "kuwo"];

  return (
    <SettingItem icon={Music} title="平台内置源" subtitle="管理各平台音源解析端点 · 点击圆圈单独测试" onClick={() => setExpanded(!expanded)} showChevron isExpanded={expanded}
      expandedContent={
        <div className="space-y-2">
          {/* 平台 Tab 切换 */}
          <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
            {platforms.map(p => (
              <button
                key={p}
                onClick={() => setActiveTab(p)}
                className={cn(
                  "flex-1 py-1.5 text-xs font-medium rounded-md transition-colors",
                  activeTab === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
          {/* 当前平台 */}
          <PlatformCard platform={activeTab} />
          {/* 流云IDC Key */}
          <div className="rounded-xl bg-card/50 border border-border/50 p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-foreground shrink-0">流云IDC Key</span>
              <input
                type="text"
                value={liuyunKey}
                onChange={(e) => setLiuyunKey(e.target.value)}
                placeholder="每日更新 · 粘贴后自动持久化"
                className="flex-1 h-7 px-2 text-xs bg-transparent border border-border rounded-md outline-none focus:border-primary/50"
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              用于 qi_liuyunidc / kg_liuyunidc · 持久化存储（重启不丢）
            </p>
          </div>
        </div>
      }
    />
  );
}
