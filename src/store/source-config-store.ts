// ============================================================
// 内置源配置 Store
//
// 持久化用户对每个平台内置源的配置：
//   - 启用/禁用
//   - 自定义优先级
//   - 测试结果缓存
// ============================================================

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { storeKey } from "./store-keys";
import { idbStorage } from "@/lib/storage-adapter";
import type {
  MusicPlatform,
  SourceTestResult,
} from "@otter-music/shared";
import {
  INTERNAL_SOURCES_BY_PLATFORM,
  DEFAULT_ENABLED_SOURCES,
} from "@otter-music/shared";

/** 单个内置源的运行时配置 */
export interface SourceConfigEntry {
  enabled: boolean;
  userPriority: number | null;
  lastTestResult: SourceTestResult;
  lastTestTime: number | null;
  /** 测试详情（格式/大小/速度/错误） */
  testFormat?: string;
  testSize?: string;
  testDurationMs?: number;
  testError?: string;
}

/** 按平台组织的源配置 */
export type SourceConfigMap = Record<MusicPlatform, Record<string, SourceConfigEntry>>;

/** 创建默认配置：每个平台top 3启用，其余禁用 */
function createDefaultConfigs(): SourceConfigMap {
  const configs = {} as SourceConfigMap;
  for (const platform of Object.keys(INTERNAL_SOURCES_BY_PLATFORM) as MusicPlatform[]) {
    configs[platform] = {};
    const sources = INTERNAL_SOURCES_BY_PLATFORM[platform];
    const defaultEnabled = DEFAULT_ENABLED_SOURCES[platform] || [];
    for (const source of sources) {
      configs[platform][source.id] = {
        enabled: defaultEnabled.includes(source.id),
        userPriority: null,
        lastTestResult: null,
        lastTestTime: null,
      };
    }
  }
  return configs;
}

interface SourceConfigState {
  /** 按平台组织的源配置 */
  configs: SourceConfigMap;

  // --- 读写 ---

  /** 获取指定源的配置 */
  getSourceConfig: (sourceId: string) => SourceConfigEntry | undefined;

  /** 切换启用状态 */
  toggleSource: (sourceId: string) => void;

  /** 设置启用状态 */
  setSourceEnabled: (sourceId: string, enabled: boolean) => void;

  /** 设置自定义优先级 */
  setSourcePriority: (sourceId: string, priority: number | null) => void;

  /** 记录测试结果（含详情） */
  recordTestResult: (sourceId: string, result: SourceTestResult, detail?: { format?: string; size?: string; durationMs?: number; error?: string }) => void;

  /** 清空某个平台的测试结果 */
  clearTestResults: (platform: MusicPlatform) => void;

  /** 重置所有配置到默认 */
  resetAll: () => void;

  // --- 查询 ---

  /** 获取平台上已启用源的 ID 列表（按优先级排序） */
  getEnabledSourceIds: (platform: MusicPlatform) => string[];

  /** 获取平台统计 */
  getPlatformStats: (platform: MusicPlatform) => {
    total: number;
    enabled: number;
    healthy: number;
  };

  /** 设置平台所有源的启用状态 */
  setPlatformAllEnabled: (platform: MusicPlatform, enabled: boolean) => void;

  /** 流云IDC 每日 Key */
  liuyunKey: string;
  setLiuyunKey: (key: string) => void;
}

export const useSourceConfigStore = create<SourceConfigState>()(
  persist(
    (set, get) => ({
      configs: createDefaultConfigs(),

      getSourceConfig: (sourceId) => {
        for (const platform of Object.keys(get().configs) as MusicPlatform[]) {
          const entry = get().configs[platform]?.[sourceId];
          if (entry) return entry;
        }
        return undefined;
      },

      toggleSource: (sourceId) => {
        set((state) => {
          const newConfigs = { ...state.configs };
          for (const platform of Object.keys(newConfigs) as MusicPlatform[]) {
            const entry = newConfigs[platform]?.[sourceId];
            if (entry) {
              newConfigs[platform] = {
                ...newConfigs[platform],
                [sourceId]: { ...entry, enabled: !entry.enabled },
              };
              break;
            }
          }
          return { configs: newConfigs };
        });
      },

      setSourceEnabled: (sourceId, enabled) => {
        set((state) => {
          const newConfigs = { ...state.configs };
          for (const platform of Object.keys(newConfigs) as MusicPlatform[]) {
            const entry = newConfigs[platform]?.[sourceId];
            if (entry) {
              newConfigs[platform] = {
                ...newConfigs[platform],
                [sourceId]: { ...entry, enabled },
              };
              break;
            }
          }
          return { configs: newConfigs };
        });
      },

      setSourcePriority: (sourceId, priority) => {
        set((state) => {
          const newConfigs = { ...state.configs };
          for (const platform of Object.keys(newConfigs) as MusicPlatform[]) {
            const entry = newConfigs[platform]?.[sourceId];
            if (entry) {
              newConfigs[platform] = {
                ...newConfigs[platform],
                [sourceId]: { ...entry, userPriority: priority },
              };
              break;
            }
          }
          return { configs: newConfigs };
        });
      },

      recordTestResult: (sourceId, result, detail) => {
        set((state) => {
          const newConfigs = { ...state.configs };
          for (const platform of Object.keys(newConfigs) as MusicPlatform[]) {
            const entry = newConfigs[platform]?.[sourceId];
            if (entry) {
              newConfigs[platform] = {
                ...newConfigs[platform],
                [sourceId]: {
                  ...entry,
                  lastTestResult: result,
                  lastTestTime: Date.now(),
                  testFormat: detail?.format,
                  testSize: detail?.size,
                  testDurationMs: detail?.durationMs,
                  testError: result === "fail" ? (detail?.error ?? entry.testError) : undefined,
                },
              };
              break;
            }
          }
          return { configs: newConfigs };
        });
      },

      clearTestResults: (platform) => {
        set((state) => {
          const platformConfigs = { ...state.configs[platform] };
          for (const id of Object.keys(platformConfigs)) {
            platformConfigs[id] = {
              ...platformConfigs[id],
              lastTestResult: null,
              lastTestTime: null,
            };
          }
          return {
            configs: { ...state.configs, [platform]: platformConfigs },
          };
        });
      },

      resetAll: () => set({ configs: createDefaultConfigs() }),

      liuyunKey: "",
      setLiuyunKey: (key) => set({ liuyunKey: key }),

      getEnabledSourceIds: (platform) => {
        const platformConfigs = get().configs[platform] || {};
        const sources = INTERNAL_SOURCES_BY_PLATFORM[platform] || [];
        return sources
          .filter((s) => platformConfigs[s.id]?.enabled ?? false)
          .sort((a, b) => {
            const pa = platformConfigs[a.id]?.userPriority ?? a.priority;
            const pb = platformConfigs[b.id]?.userPriority ?? b.priority;
            return pa - pb;
          })
          .map((s) => s.id);
      },

      getPlatformStats: (platform) => {
        const platformConfigs = get().configs[platform] || {};
        const entries = Object.values(platformConfigs);
        return {
          total: entries.length,
          enabled: entries.filter((e) => e.enabled).length,
          healthy: entries.filter((e) => e.lastTestResult === "ok").length,
        };
      },

      setPlatformAllEnabled: (platform, enabled) => {
        set((state) => {
          const platformConfigs = { ...state.configs[platform] };
          for (const id of Object.keys(platformConfigs)) {
            platformConfigs[id] = { ...platformConfigs[id], enabled };
          }
          return {
            configs: { ...state.configs, [platform]: platformConfigs },
          };
        });
      },
    }),
    {
      name: storeKey.SourceConfigStore,
      storage: createJSONStorage(() => idbStorage),
      // 仅持久化 configs 部分
      partialize: (state) => ({ configs: state.configs, liuyunKey: state.liuyunKey }),
    }
  )
);
