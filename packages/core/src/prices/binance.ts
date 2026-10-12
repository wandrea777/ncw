import { withRetry } from "../http";
import { createPriceSeries, utcDayKey, type PriceSeries } from "./series";

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export const BINANCE_DATA_HOST = "https://data-api.binance.vision";

/**
 * Dagelijkse openingskoers (00:00 UTC) in EUR via de publieke Binance-marktdata.
 * EUR-paren bestaan vanaf januari 2020.
 */
export async function fetchDailyEurPrices(
  symbol: "BTC" | "ETH",
  year: number,
  fetchFn: FetchLike = fetch,
): Promise<PriceSeries> {
  const start = Date.UTC(year, 0, 1);
  const url = `${BINANCE_DATA_HOST}/api/v3/klines?symbol=${symbol}EUR&interval=1d&startTime=${start}&limit=367`;
  const res = await withRetry(fetchFn)(url);
  if (!res.ok) throw new Error(`Koersen ophalen mislukt (${res.status}).`);
  const rows = (await res.json()) as Array<[number, string, ...unknown[]]>;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`Geen koersdata voor ${symbol} in ${year}.`);
  const entries: Array<[string, number]> = rows.map((r) => [utcDayKey(r[0]), Number(r[1])]);
  return createPriceSeries(symbol, "Binance (dagopening 00:00 UTC, paar " + symbol + "EUR)", entries);
}
