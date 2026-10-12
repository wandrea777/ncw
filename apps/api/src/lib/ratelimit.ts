import type { MiddlewareHandler } from "hono";
import { ApiError } from "./errors.ts";

/**
 * Eenvoudige token bucket per sleutel (IP + routegroep), in geheugen.
 * Voldoende voor één instantie; bij horizontaal schalen vervangen door een gedeelde store (zie docs/architecture).
 */
export function rateLimit(opts: { name: string; capacity: number; refillPerMinute: number; key: (c: Parameters<MiddlewareHandler>[0]) => string }): MiddlewareHandler {
  const buckets = new Map<string, { tokens: number; at: number }>();
  const perMs = opts.refillPerMinute / 60_000;
  return async (c, next) => {
    const now = Date.now();
    const key = `${opts.name}:${opts.key(c)}`;
    const b = buckets.get(key) ?? { tokens: opts.capacity, at: now };
    b.tokens = Math.min(opts.capacity, b.tokens + (now - b.at) * perMs);
    b.at = now;
    if (b.tokens < 1) {
      c.header("Retry-After", String(Math.ceil((1 - b.tokens) / perMs / 1000)));
      throw new ApiError(429, "rate_limited", "Te veel verzoeken. Probeer het later opnieuw.");
    }
    b.tokens -= 1;
    buckets.set(key, b);
    if (buckets.size > 50_000) for (const [k, v] of buckets) if (now - v.at > 600_000) buckets.delete(k);
    await next();
  };
}
