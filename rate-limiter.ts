// ============================================================================
// Rate Limiter + Resilient HTTP Fetcher
// ============================================================================
// NHTSA doesn't publish rate limits, so we play it safe:
//   - 500ms minimum gap between requests
//   - Exponential backoff on 429 / 5xx / timeouts
//   - 3 retries before giving up on a single request
// ============================================================================

import { z } from "zod";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CONFIG = {
  /** Minimum milliseconds between any two requests */
  minDelayMs: 500,
  /** Base delay for exponential backoff (doubles each retry) */
  backoffBaseMs: 2_000,
  /** Maximum retries per request */
  maxRetries: 3,
  /** Abort request after this many ms */
  timeoutMs: 30_000,
} as const;

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------
let lastRequestTime = 0;
let totalRequests = 0;

// ---------------------------------------------------------------------------
// sleep helper
// ---------------------------------------------------------------------------
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Throttled fetch with retry + backoff
// ---------------------------------------------------------------------------
export async function throttledFetch<T>(
  url: string,
  schema?: z.ZodType<T>,
  label?: string,
): Promise<T> {
  // Enforce minimum gap
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < CONFIG.minDelayMs) {
    await sleep(CONFIG.minDelayMs - elapsed);
  }

  for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      lastRequestTime = Date.now();
      totalRequests++;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CONFIG.timeoutMs);

      const tag = label ?? url.slice(0, 80);
      if (attempt > 0) {
        console.log(`  ↻ Retry ${attempt}/${CONFIG.maxRetries} for ${tag}`);
      }

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "Accept": "application/json" },
      });
      clearTimeout(timeout);

      // Rate-limited or server error → backoff
      if (response.status === 429 || response.status >= 500) {
        const delay = CONFIG.backoffBaseMs * Math.pow(2, attempt);
        console.warn(
          `  ⚠ HTTP ${response.status} on ${tag} — backing off ${delay}ms`,
        );
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();

      // Optionally validate with Zod
      if (schema) {
        return schema.parse(json);
      }
      return json as T;
    } catch (err: unknown) {
      const isAbort =
        err instanceof DOMException && err.name === "AbortError";
      const isTimeout = isAbort;

      if (isTimeout) {
        console.warn(
          `  ⏱ Timeout on ${label ?? url} (attempt ${attempt + 1})`,
        );
      }

      // If we've exhausted retries, throw
      if (attempt === CONFIG.maxRetries) {
        throw new Error(
          `Failed after ${CONFIG.maxRetries + 1} attempts: ${url}\n  Last error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // Otherwise backoff and retry
      const delay = CONFIG.backoffBaseMs * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  // TypeScript exhaustiveness (unreachable)
  throw new Error("Unreachable");
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
export function getRequestStats() {
  return { totalRequests };
}
