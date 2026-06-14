// ============================================================
// PlatformSourceManager
//
// 管理一个平台下所有内置源的运行时状态：
//   - 内置源的启用/禁用、自定义优先级
//   - 源可用性测试结果缓存
//   - 提供 getEnabledHandlers() — 按优先级排序的已启用处理器列表
// ============================================================

import type {
  MusicPlatform,
  InternalSource,
  InternalSourceConfig,
  SourceTestResult,
} from "@otter-music/shared";
import {
  INTERNAL_SOURCES_BY_PLATFORM,
  INTERNAL_SOURCE_MAP,
  PLATFORM_LABELS,
} from "@otter-music/shared";
import type { InternalSourceHandler } from "./internal-sources/base";
import { HANDLER_MAP } from "./internal-sources";
import { testSingleSource } from "./source-tester";

/** 用户对内置源的配置（持久化到 Store） */
export interface UserSourceSettings {
  /** sourceId → 是否启用 */
  enabled: Record<string, boolean>;
  /** sourceId → 自定义优先级（null 使用默认） */
  priorities: Record<string, number | null>;
  /** sourceId → 最近测试结果 */
  testResults: Record<string, SourceTestResult>;
  /** sourceId → 最近测试时间 (ms) */
  testTimes: Record<string, number>;
}

/** 平台源管理器 */
export class PlatformSourceManager {
  readonly platform: MusicPlatform;
  readonly allSources: InternalSource[];
  private settings: UserSourceSettings;

  constructor(platform: MusicPlatform, settings?: Partial<UserSourceSettings>) {
    this.platform = platform;
    this.allSources = [...INTERNAL_SOURCES_BY_PLATFORM[platform]].sort(
      (a, b) => a.priority - b.priority
    );
    this.settings = {
      enabled: {},
      priorities: {},
      testResults: {},
      testTimes: {},
      ...settings,
    };
  }

  get label(): string {
    return PLATFORM_LABELS[this.platform];
  }

  /** 获取所有内置源定义 */
  get sources(): InternalSource[] {
    return this.allSources;
  }

  /** 获取源是否已启用 */
  isEnabled(sourceId: string): boolean {
    return this.settings.enabled[sourceId] ?? true; // 默认全部启用
  }

  /** 切换启用状态 */
  toggleEnabled(sourceId: string): void {
    this.settings.enabled[sourceId] = !this.isEnabled(sourceId);
  }

  /** 获取源优先级 */
  getPriority(sourceId: string): number {
    const custom = this.settings.priorities[sourceId];
    if (custom !== null && custom !== undefined) return custom;
    return INTERNAL_SOURCE_MAP[sourceId]?.priority ?? 999;
  }

  /** 设置自定义优先级 */
  setPriority(sourceId: string, priority: number | null): void {
    this.settings.priorities[sourceId] = priority;
  }

  /** 获取测试结果 */
  getTestResult(sourceId: string): SourceTestResult {
    return this.settings.testResults[sourceId] ?? null;
  }

  /** 获取最近测试时间 */
  getTestTime(sourceId: string): number | null {
    return this.settings.testTimes[sourceId] ?? null;
  }

  /** 测试单个源并缓存结果 */
  async testSource(sourceId: string): Promise<import("./source-tester").TestOutcome> {
    const outcome = await testSingleSource(sourceId);
    this.settings.testResults[sourceId] = outcome.status;
    this.settings.testTimes[sourceId] = Date.now();
    return outcome;
  }

  /** 批量测试所有已启用源（并发3个） */
  async testAllEnabled(
    onProgress?: (sourceId: string, result: import("./source-tester").TestOutcome) => void
  ): Promise<void> {
    const enabledIds = this.getEnabledSourceIds();
    const chunks = chunkArray(enabledIds, 3);

    for (const chunk of chunks) {
      const results = await Promise.all(
        chunk.map(async (id) => {
          const result = await this.testSource(id);
          onProgress?.(id, result);
          return { id, result };
        })
      );
    }
  }

  /** 获取已启用的源ID列表（按优先级排序） */
  getEnabledSourceIds(): string[] {
    return this.allSources
      .filter((s) => this.isEnabled(s.id))
      .sort((a, b) => this.getPriority(a.id) - this.getPriority(b.id))
      .map((s) => s.id);
  }

  /** 获取已启用的源处理器列表（按优先级排序） */
  getEnabledHandlers(): InternalSourceHandler[] {
    return this.getEnabledSourceIds()
      .map((id) => HANDLER_MAP[id])
      .filter(Boolean) as InternalSourceHandler[];
  }

  /** 获取处理器（用于指定 sourceId 调用） */
  getHandler(sourceId: string): InternalSourceHandler | undefined {
    return HANDLER_MAP[sourceId];
  }

  /** 判断是否有至少一个已启用源通过最近测试 */
  get hasHealthySource(): boolean {
    return this.getEnabledSourceIds().some(
      (id) => this.getTestResult(id) === "ok"
    );
  }

  /** 获取配置快照（用于序列化到 store） */
  getSettingsSnapshot(): UserSourceSettings {
    return {
      enabled: { ...this.settings.enabled },
      priorities: { ...this.settings.priorities },
      testResults: { ...this.settings.testResults },
      testTimes: { ...this.settings.testTimes },
    };
  }

  /** 从快照恢复配置 */
  applySettingsSnapshot(settings: Partial<UserSourceSettings>): void {
    if (settings.enabled) Object.assign(this.settings.enabled, settings.enabled);
    if (settings.priorities) Object.assign(this.settings.priorities, settings.priorities);
    if (settings.testResults) Object.assign(this.settings.testResults, settings.testResults);
    if (settings.testTimes) Object.assign(this.settings.testTimes, settings.testTimes);
  }

  /** 统计信息 */
  get stats() {
    const allIds = this.allSources.map((s) => s.id);
    const enabledIds = this.getEnabledSourceIds();
    const healthyIds = enabledIds.filter((id) => this.getTestResult(id) === "ok");
    return {
      total: allIds.length,
      enabled: enabledIds.length,
      healthy: healthyIds.length,
      healthyRate: enabledIds.length > 0 ? healthyIds.length / enabledIds.length : 0,
    };
  }
}

// --- helpers ---

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}
