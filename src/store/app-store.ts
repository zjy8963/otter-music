import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { storeKey } from "./store-keys";
import { idbStorage } from "@/lib/storage-adapter";
import {
  type UpdateInfo,
  checkUpdate as apiCheckUpdate,
} from "@/lib/api/update";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { toast } from "react-hot-toast";
import { logger } from "@/lib/logger";

interface AppState {
  currentVersion: string;
  lastCheckTime: number;
  latestVersionInfo: UpdateInfo | null;
  isChecking: boolean;
  /** 是否已完成过首次启动初始化 */
  launchedBefore: boolean;
  /** 是否启用定时自动测试内置源 */
  autoTestEnabled: boolean;
  /** 自动测试间隔（小时） */
  autoTestIntervalHours: number;
  /** 上次自动测试时间戳 */
  lastAutoTestTime: number;
}

interface AppActions {
  checkUpdate: (silent?: boolean) => Promise<void>;
  resetCheckTime: () => void;
  setLaunchedBefore: () => void;
  setAutoTestEnabled: (enabled: boolean) => void;
  setAutoTestIntervalHours: (hours: number) => void;
  setLastAutoTestTime: (time: number) => void;
}

const initialState: AppState = {
  currentVersion: "0.0.0",
  lastCheckTime: 0,
  latestVersionInfo: null,
  isChecking: false,
  launchedBefore: false,
  autoTestEnabled: true,
  autoTestIntervalHours: 24,
  lastAutoTestTime: 0,
};

/* =========================
   工具函数
========================= */

const getCurrentVersion = async (): Promise<string> => {
  try {
    if (Capacitor.isNativePlatform()) {
      const info = await App.getInfo();
      return info.version;
    }
  } catch (e) {
    console.error("Failed to get app version", e);
  }
  return __APP_VERSION__;
};

const normalizeVersion = (version: string): string => {
  const trimmed = version.trim().replace(/^v/i, "");
  const match = trimmed.match(/\d+(?:\.\d+)*/);
  return match?.[0] ?? "0.0.0";
};

const compareVersions = (a: string, b: string): number => {
  const va = normalizeVersion(a).split(".").map(Number);
  const vb = normalizeVersion(b).split(".").map(Number);

  const len = Math.max(va.length, vb.length);
  for (let i = 0; i < len; i++) {
    const na = va[i] ?? 0;
    const nb = vb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
};

/* =========================
   Store
========================= */

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      checkUpdate: async (silent = false) => {
        const now = Date.now();
        const state = get();

        if (state.isChecking) return;
        set({ isChecking: true });

        try {
          const currentVersion = await getCurrentVersion();
          set({ currentVersion });

          const info = await apiCheckUpdate();

          const hasUpdate =
            compareVersions(currentVersion, info.latestVersion) < 0;

          set({
            latestVersionInfo: hasUpdate ? info : null,
            lastCheckTime: now,
          });

          if (hasUpdate) {
            toast(`发现新版本 ${info.latestVersion}`, {
              icon: "✨",
              duration: 3000,
            });
          } else if (!silent) {
            toast.success(`当前已是最新版本 (${currentVersion})`);
          }
        } catch (error) {
          if (
            silent &&
            error instanceof DOMException &&
            error.name === "AbortError"
          ) {
            logger.info("app-store", "Update check timed out (offline)", {
              silent,
            });
          } else {
            logger.error("app-store", "Update check failed", error, {
              silent,
            });
          }
          if (!silent) {
            toast.error("检查更新失败，请稍后重试");
          }
        } finally {
          set({ isChecking: false });
        }
      },

      resetCheckTime: () => set({ lastCheckTime: 0 }),
      setLaunchedBefore: () => set({ launchedBefore: true }),
      setAutoTestEnabled: (enabled) => set({ autoTestEnabled: enabled }),
      setAutoTestIntervalHours: (hours) => set({ autoTestIntervalHours: hours }),
      setLastAutoTestTime: (time) => set({ lastAutoTestTime: time }),
    }),
    {
      name: storeKey.AppStore,
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({
        lastCheckTime: state.lastCheckTime,
        latestVersionInfo: state.latestVersionInfo,
        launchedBefore: state.launchedBefore,
        autoTestEnabled: state.autoTestEnabled,
        autoTestIntervalHours: state.autoTestIntervalHours,
        lastAutoTestTime: state.lastAutoTestTime,
      }),
    }
  )
);
