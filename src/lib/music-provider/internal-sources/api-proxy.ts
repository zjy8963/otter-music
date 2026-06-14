// ============================================================
// API 代理工具 — 生产 Web 模式通过 Functions 代理绕过 CORS
// 开发/原生模式直连
// ============================================================

import { IS_NATIVE } from "@/lib/api/config";

const TIMEOUT = 15000;

interface ProxyResponse {
  ok: boolean;
  status: number;
  data: any;
  error?: string;
}

/** 直连 fetch（原生 + 开发模式） */
async function directFetch(url: string, init: RequestInit = {}, signal?: AbortSignal): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        ...(init.headers as Record<string, string> || {}),
      },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return await res.json();
    return await res.text();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", () => controller.abort());
  }
}

/** 通过代理（开发 Vite middleware / 生产 Functions） */
async function proxyFetch(url: string, init: RequestInit = {}, signal?: AbortSignal): Promise<any> {
  const proxyUrl = "/music-api/thirdparty";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  signal?.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    const res = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        method: init.method || "GET",
        headers: init.headers || {},
        body: init.body instanceof URLSearchParams ? init.body.toString() : (init.body || undefined),
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const result: ProxyResponse = await res.json();
    if (!result.ok) throw new Error(result.error || `Proxy ${result.status}`);
    return result.data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", () => controller.abort());
  }
}

/**
 * 通用 API fetch
 * - 原生端：直连（无 CORS 限制）
 * - 开发 Web：直连（部分 API 可能 CORS 失败，但这是预期行为）
 * - 生产 Web：通过 Functions /music-api/thirdparty 代理
 */
export async function apiFetch(
  url: string,
  init: RequestInit = {},
  signal?: AbortSignal
): Promise<any> {
  // 非原生端统一走代理（开发: Vite middleware / 生产: Functions）
  if (!IS_NATIVE) {
    return proxyFetch(url, init, signal);
  }
  // 原生端直连
  return directFetch(url, init, signal);
}
