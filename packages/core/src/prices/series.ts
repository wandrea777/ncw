/** Dagkoersen in EUR, gesleuteld op UTC-dag (YYYY-MM-DD). */
export interface PriceSeries {
  symbol: string;
  source: string;
  priceOn(day: string): number;
  lastDay(): number;
}

export function utcDayKey(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export function createPriceSeries(symbol: string, source: string, entries: Array<[string, number]>): PriceSeries {
  const map = new Map(entries);
  const days = [...map.keys()].sort();
  return {
    symbol,
    source,
    priceOn(day) {
      const p = map.get(day);
      if (p === undefined) throw new Error(`Geen ${symbol}/EUR-koers voor ${day} (bron: ${source}).`);
      return p;
    },
    lastDay() {
      const last = days[days.length - 1];
      if (!last) throw new Error(`Lege koersreeks voor ${symbol}.`);
      return Date.parse(`${last}T00:00:00Z`);
    },
  };
}
