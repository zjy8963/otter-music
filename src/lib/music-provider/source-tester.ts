// ============================================================
// 源可用性测试工具 — 返回格式、大小、速度等详情
// ============================================================

import type { SourceTestResult as SourceTestStatus, MusicPlatform } from "@otter-music/shared";
import { INTERNAL_SOURCE_MAP } from "@otter-music/shared";
import { HANDLER_MAP } from "./internal-sources";

export const SOURCE_TEST_TIMEOUT_MS = 15000;

export const TEST_SONG_IDS: Record<MusicPlatform, Record<string, string>> = {
  netease: { "天外来物": "1463165983", "成都": "436514312" },
  qq: { "天外来物": "0013WPvt4fQH2b", "成都": "003TLWoN0gQnP5" },
  kugou: { "天外来物": "761C1EAFBD1E22504B487F84D2152DF5", "成都": "A06B033B356BFC974C5245D0195086A5" },
  kuwo: { "天外来物": "145389372", "成都": "9918220" },
};

export function getTestSongId(platform: MusicPlatform): string {
  return Object.values(TEST_SONG_IDS[platform])[0] || "";
}

/** 详细的测试结果 */
export interface TestOutcome {
  status: SourceTestStatus;
  durationMs: number;
  format?: string;       // flac / mp3 / m4a / ogg
  size?: string;         // "25.94 MB"
  error?: string;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "N/A";
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function detectFormat(url: string, contentType?: string | null): string {
  // 从 Content-Type 检测
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (ct.includes("audio/flac") || ct.includes("x-flac")) return "flac";
    if (ct.includes("audio/mpeg") || ct.includes("audio/mp3")) return "mp3";
    if (ct.includes("audio/mp4") || ct.includes("audio/x-m4a")) return "m4a";
    if (ct.includes("audio/ogg")) return "ogg";
    if (ct.includes("audio/wav")) return "wav";
    if (ct.includes("audio/aac")) return "aac";
    if (ct.includes("application/octet-stream")) return "bin";
  }
  // 从 URL 扩展名检测
  try {
    const p = new URL(url).pathname.toLowerCase();
    for (const ext of ["flac", "mp3", "m4a", "ogg", "wav", "aac", "opus", "wma", "mgg"]) {
      if (p.endsWith(`.${ext}`)) return ext;
    }
  } catch {}
  return "?";
}

export async function testSingleSource(sourceId: string, signal?: AbortSignal): Promise<TestOutcome> {
  const source = INTERNAL_SOURCE_MAP[sourceId];
  if (!source) return { status: "fail", durationMs: 0, error: `Unknown: ${sourceId}` };
  const handler = HANDLER_MAP[sourceId];
  if (!handler) return { status: "fail", durationMs: 0, error: `No handler` };
  const testSongId = getTestSongId(source.platform);
  if (!testSongId) return { status: "fail", durationMs: 0, error: "No test song" };

  const start = performance.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), SOURCE_TEST_TIMEOUT_MS);
    signal?.addEventListener("abort", () => ctrl.abort(), { once: true });
    const result = await handler.resolveUrl(testSongId, "lossless", ctrl.signal);
    clearTimeout(t);
    const durationMs = Math.round(performance.now() - start);

    // handler 可能返回 NO_COPYRIGHT symbol (无版权)
    if (!result || typeof result !== "string") {
      return {
        status: result === null ? "fail" : "fail",
        durationMs,
        error: typeof result === "symbol" ? "no copyright" : "empty",
      };
    }

    if (result.startsWith("http")) {
      let fmt = detectFormat(result);
      let size = "N/A";
      try {
        const hr = await fetch(result, { method: "HEAD", signal: AbortSignal.timeout(3000) });
        const ct = hr.headers.get("content-type");
        const cl = hr.headers.get("content-length");
        // Content-Type 仅作补充（URL 扩展名可信度更高，CDN 常返回错误 MIME）
        if (ct && fmt === "?") fmt = detectFormat(result, ct);
        if (cl) size = formatBytes(parseInt(cl));
      } catch {
        try {
          const hr = await fetch(result, { headers: { Range: "bytes=0-0" }, signal: AbortSignal.timeout(3000) });
          const ct = hr.headers.get("content-type");
          const cr = hr.headers.get("content-range");
          if (ct) fmt = detectFormat(result, ct);
          if (cr) {
            const total = cr.split("/")[1];
            if (total && total !== "*") size = formatBytes(parseInt(total));
          }
        } catch {}
      }
      return { status: "ok", durationMs, format: fmt, size };
    }
    return { status: "fail", durationMs, error: "Invalid URL" };
  } catch (e: any) {
    const durationMs = Math.round(performance.now() - start);
    const isTimeout = e?.name === "TimeoutError" || e?.name === "AbortError" || String(e?.message||"").includes("timeout");
    return { status: isTimeout ? "timeout" : "fail", durationMs, error: e?.message?.slice(0, 80) };
  }
}
