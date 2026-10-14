import type { FetchLike } from "./prices/binance";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wikkelt een fetch-functie met automatisch opnieuw proberen bij rate limiting (429) en
 * tijdelijke serverfouten (5xx), met exponentiële wachttijd en respect voor Retry-After.
 */
export function withRetry<F extends FetchLike>(fetchFn: F, opts: { retries?: number; baseDelayMs?: number } = {}): F {
  const retries = opts.retries ?? 6;
  const base = opts.baseDelayMs ?? 1000;
  return (async (url: string) => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchFn(url);
      const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
      if (!retryable || attempt >= retries) return res;
      const header = (res as { headers?: { get(n: string): string | null } }).headers?.get("retry-after");
      const retryAfter = header ? Number(header) * 1000 : NaN;
      await sleep(Number.isFinite(retryAfter) ? Math.min(retryAfter, 30_000) : base * 2 ** attempt);
    }
  }) as F;
}

export { sleep };
