// ============================================================
// 第三方 API 通用代理端点
//
// Web 端所有第三方 API 调用均通过此端点转发以绕过 CORS。
// POST /music-api/thirdparty
//   body: { url, method?, headers?, body? }
//   返回: { ok, status, data }
// ============================================================

import { Hono } from "hono";
import type { Env } from "../../types/hono";

export const thirdpartyRoutes = new Hono<{ Bindings: Env }>();

const REQUEST_TIMEOUT = 15000;

thirdpartyRoutes.post("/", async (c) => {
  try {
    const { url, method = "GET", headers = {}, body } = await c.req.json<{
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    }>();

    if (!url) return c.json({ ok: false, error: "url required" }, 400);

    // 安全防护：禁止内网请求
    const targetHost = new URL(url).hostname;
    if (
      targetHost === "localhost" ||
      targetHost === "127.0.0.1" ||
      targetHost.startsWith("192.168.") ||
      targetHost.startsWith("10.") ||
      targetHost.startsWith("172.")
    ) {
      return c.json({ ok: false, error: "Blocked internal host" }, 403);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
          Accept: "application/json, */*",
          ...headers,
        },
        body: method !== "GET" && method !== "HEAD" ? body : undefined,
        signal: controller.signal,
      });

      clearTimeout(timer);

      const contentType = res.headers.get("content-type") || "";
      let data: any;

      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        data = await res.text();
      }

      return c.json({
        ok: res.ok,
        status: res.status,
        data,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (e: any) {
    if (e.name === "AbortError" || e.message?.includes("abort")) {
      return c.json({ ok: false, error: "timeout" }, 504);
    }
    return c.json({ ok: false, error: e.message || "proxy error" }, 502);
  }
});
