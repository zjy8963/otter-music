// ============================================================
// 内置源自检与自动测试
//
// - 首次启动：启用四平台全部内置源 → 逐源测试 → 关闭失效源
// - 非首次启动：仅测试已启用源 → 关闭失效源
// - 定时测试：按设置间隔自动重测
// ============================================================

import { useAppStore } from "@/store/app-store";
import { useSourceConfigStore } from "@/store/source-config-store";
import { useMusicStore } from "@/store/music-store";
import { testSingleSource } from "@/lib/music-provider/source-tester";
import { logger } from "@/lib/logger";
import { DEFAULT_SOURCE_CONFIGS, type SourceConfig } from "@/types/music";
import { INTERNAL_SOURCES_BY_PLATFORM, type MusicPlatform } from "@otter-music/shared";

/** 首次启动时要启用的聚合音源平台 */
const FIRST_LAUNCH_PLATFORMS: string[] = ["netease", "qq", "kugou", "kuwo"];

/** 测试并发数 */
const TEST_CONCURRENCY = 8;

/** 获取所有已启用的内置源 ID */
function getEnabledSourceIds(): string[] {
  const store = useSourceConfigStore.getState();
  const ids: string[] = [];
  for (const platform of Object.keys(INTERNAL_SOURCES_BY_PLATFORM) as MusicPlatform[]) {
    ids.push(...store.getEnabledSourceIds(platform));
  }
  return ids;
}

/** 获取所有内置源 ID */
function getAllSourceIds(): string[] {
  const ids: string[] = [];
  for (const platform of Object.keys(INTERNAL_SOURCES_BY_PLATFORM) as MusicPlatform[]) {
    for (const source of INTERNAL_SOURCES_BY_PLATFORM[platform]) {
      ids.push(source.id);
    }
  }
  return ids;
}

/**
 * 并发测试一批源，并将结果写入 store。
 * 返回失败源的 ID 列表。
 */
async function runTests(sourceIds: string[]): Promise<string[]> {
  const configStore = useSourceConfigStore.getState();
  const failedIds: string[] = [];

  // 分批并发
  for (let i = 0; i < sourceIds.length; i += TEST_CONCURRENCY) {
    const batch = sourceIds.slice(i, i + TEST_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (id) => {
        const outcome = await testSingleSource(id);
        configStore.recordTestResult(id, outcome.status, {
          format: outcome.format,
          size: outcome.size,
          durationMs: outcome.durationMs,
          error: outcome.error,
        });
        return { id, status: outcome.status };
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value.status === "fail") {
        failedIds.push(r.value.id);
      }
    }
  }

  return failedIds;
}

/**
 * 首次启动：启用四平台的聚合音源 + 全部内置源，然后测试。
 */
async function firstLaunchInit(): Promise<void> {
  logger.info("auto-test", "首次启动 — 初始化音源配置");

  const musicStore = useMusicStore.getState();
  const sourceStore = useSourceConfigStore.getState();

  // 1. 设置聚合音源：netease/qq/kugou/kuwo 启用
  const newConfigs: SourceConfig[] = DEFAULT_SOURCE_CONFIGS.map((c) => ({
    ...c,
    enabled: FIRST_LAUNCH_PLATFORMS.includes(c.source),
  }));
  musicStore.setSourceConfigs(newConfigs);

  // 2. 启用四平台下全部内置源
  for (const platform of FIRST_LAUNCH_PLATFORMS) {
    sourceStore.setPlatformAllEnabled(platform as MusicPlatform, true);
  }

  // 3. 测试全部内置源
  const allIds = getAllSourceIds();
  logger.info("auto-test", `首次启动测试 ${allIds.length} 个源`);
  const failedIds = await runTests(allIds);

  // 4. 关闭失效源
  for (const id of failedIds) {
    sourceStore.setSourceEnabled(id, false);
  }
  logger.info("auto-test", `首次启动 — 关闭 ${failedIds.length} 个失效源`);
}

/**
 * 常规启动 / 定时测试：仅测试已启用的源，关闭失效源。
 */
export async function runAutoTest(): Promise<void> {
  const enabledIds = getEnabledSourceIds();
  if (enabledIds.length === 0) {
    logger.info("auto-test", "无已启用源，跳过测试");
    return;
  }

  logger.info("auto-test", `测试 ${enabledIds.length} 个已启用源`);
  const failedIds = await runTests(enabledIds);

  if (failedIds.length > 0) {
    const sourceStore = useSourceConfigStore.getState();
    for (const id of failedIds) {
      sourceStore.setSourceEnabled(id, false);
    }
    logger.info("auto-test", `关闭 ${failedIds.length} 个失效源`);
  }
}

/**
 * 启动时调用：检测是否首次启动并执行相应初始化。
 * 应在 App 挂载后尽早调用（非阻塞）。
 */
export async function initAutoTest(): Promise<void> {
  const appStore = useAppStore.getState();

  if (!appStore.launchedBefore) {
    // 首次启动：全量初始化
    await firstLaunchInit();
    appStore.setLaunchedBefore();
    appStore.setLastAutoTestTime(Date.now());
  } else {
    // 非首次：测试已启用源
    await runAutoTest();
    appStore.setLastAutoTestTime(Date.now());
  }
}

/**
 * 检查是否需要定时测试（由定时器触发）。
 * 返回 true 表示已执行测试。
 */
export async function checkAndRunScheduledTest(): Promise<boolean> {
  const appStore = useAppStore.getState();
  if (!appStore.autoTestEnabled) return false;

  const now = Date.now();
  const intervalMs = appStore.autoTestIntervalHours * 60 * 60 * 1000;
  if (now - appStore.lastAutoTestTime < intervalMs) return false;

  logger.info("auto-test", "定时测试触发");
  await runAutoTest();
  appStore.setLastAutoTestTime(now);
  return true;
}
