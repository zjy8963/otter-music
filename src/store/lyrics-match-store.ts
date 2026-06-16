// ============================================================
// 歌词匹配平台偏好 Store
//
// 只持久化用户在歌词匹配界面主动禁用的平台。
// 运行时可用平台 = 全局聚合音源 enabled ∩ 歌词能力平台
// 实际勾选 = 可用平台 - disabledPlatforms
// ============================================================

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { storeKey } from "./store-keys";
import { idbStorage } from "@/lib/storage-adapter";
import type { MusicSource } from "@/types/music";

/** 支持歌词获取的平台（只有这 4 个平台有 getLyricImpl） */
export const LYRIC_CAPABLE_PLATFORMS: MusicSource[] = [
  "netease",
  "qq",
  "kugou",
  "kuwo",
];

interface LyricsMatchState {
  /** 用户在歌词匹配界面主动关闭的平台 */
  disabledPlatforms: MusicSource[];

  /** 切换某平台的启用状态 */
  togglePlatform: (source: MusicSource) => void;

  /** 判断某平台在当前可用集合中是否勾选 */
  isEffectivelyEnabled: (
    source: MusicSource,
    availablePlatforms: MusicSource[]
  ) => boolean;

  /** 重置所有禁用（恢复全选） */
  resetDisabled: () => void;
}

export const useLyricsMatchStore = create<LyricsMatchState>()(
  persist(
    (set, get) => ({
      disabledPlatforms: [],

      togglePlatform: (source) => {
        const current = get().disabledPlatforms;
        const idx = current.indexOf(source);
        if (idx >= 0) {
          // 当前禁用中 → 重新启用（移除）
          set({ disabledPlatforms: current.filter((s) => s !== source) });
        } else {
          // 当前启用中 → 禁用（加入）
          set({ disabledPlatforms: [...current, source] });
        }
      },

      isEffectivelyEnabled: (source, availablePlatforms) => {
        // 平台不在可用集合中 → 不勾选
        if (!availablePlatforms.includes(source)) return false;
        // 用户在歌词界面主动关掉了 → 不勾选
        if (get().disabledPlatforms.includes(source)) return false;
        return true;
      },

      resetDisabled: () => set({ disabledPlatforms: [] }),
    }),
    {
      name: storeKey.LyricsMatchStore,
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({
        disabledPlatforms: state.disabledPlatforms,
      }),
    }
  )
);
