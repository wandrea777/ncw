import type { AddressHistory, Asset } from "../crypto/types";
import { balanceAt, unitsToNumber } from "../crypto/valuation";
import { utcDayKey, type PriceSeries } from "../prices/series";

const DAY = 86_400_000;

/** Koersen over meerdere jaren. Zoekt een dag op in de eerste reeks die hem heeft. */
export interface PriceBook {
  priceOn(day: string): number | null;
  /** Laatste beschikbare dag (UTC-middernacht, ms). */
  lastDay(): number;
}

export function priceBook(series: PriceSeries[]): PriceBook {
  if (series.length === 0) throw new Error("Geen koersreeksen.");
  return {
    priceOn(day) {
      for (const s of series) {
        try {
          return s.priceOn(day);
        } catch {
          /* niet in deze reeks */
        }
      }
      return null;
    },
    lastDay() {
      return Math.max(...series.map((s) => s.lastDay()));
    },
  };
}

export interface Holding {
  asset: Asset;
  /** Saldo in kleinste eenheid (sat / wei), opgeteld over alle adressen van deze asset. */
  units: bigint;
  amount: number;
  /** Koers (EUR) op de laatste beschikbare dag. */
  priceEur: number;
  valueEur: number;
  /** Koerswijziging laatste dag t.o.v. de dag ervoor, als fractie (0,01 = 1%). Null zonder koers van gisteren. */
  change: number | null;
  /** Aantal adressen dat bijdraagt. */
  addresses: number;
}

export interface Snapshot {
  holdings: Holding[];
  totalEur: number;
  /** Verandering van de totale waarde t.o.v. dezelfde saldi tegen de koers van gisteren. */
  changeEur: number | null;
  change: number | null;
  /** Dag (UTC, ms) waarop de koersen gelden. */
  priceDay: number;
}

/**
 * Huidige waarde van alle gevolgde adressen. Saldi komen van de bron (`currentBalance`),
 * koersen zijn de dagopening van de laatste beschikbare dag.
 */
export function snapshot(histories: AddressHistory[], books: Partial<Record<Asset["symbol"], PriceBook>>): Snapshot {
  const bySymbol = new Map<Asset["symbol"], AddressHistory[]>();
  for (const h of histories) bySymbol.set(h.asset.symbol, [...(bySymbol.get(h.asset.symbol) ?? []), h]);

  const holdings: Holding[] = [];
  let priceDay = 0;
  for (const [symbol, hs] of bySymbol) {
    const book = books[symbol];
    if (!book) throw new Error(`Geen koersen voor ${symbol}.`);
    const last = book.lastDay();
    priceDay = Math.max(priceDay, last);
    const price = book.priceOn(utcDayKey(last));
    if (price === null) throw new Error(`Geen koers voor ${symbol} op ${utcDayKey(last)}.`);
    const prev = book.priceOn(utcDayKey(last - DAY));
    const asset = hs[0]!.asset;
    const units = hs.reduce((a, h) => a + h.currentBalance, 0n);
    const amount = unitsToNumber(units, asset.decimals);
    holdings.push({
      asset,
      units,
      amount,
      priceEur: price,
      valueEur: amount * price,
      change: prev ? price / prev - 1 : null,
      addresses: hs.length,
    });
  }
  holdings.sort((a, b) => b.valueEur - a.valueEur);

  const totalEur = holdings.reduce((a, h) => a + h.valueEur, 0);
  const comparable = holdings.every((h) => h.change !== null);
  const yesterdayEur = comparable ? holdings.reduce((a, h) => a + h.valueEur / (1 + h.change!), 0) : 0;
  const changeEur = comparable ? totalEur - yesterdayEur : null;
  return {
    holdings,
    totalEur,
    changeEur,
    change: comparable && yesterdayEur > 0 ? changeEur! / yesterdayEur : null,
    priceDay,
  };
}

export interface SeriesPoint {
  /** UTC-middernacht (ms). */
  t: number;
  valueEur: number;
}

/**
 * Waarde van de portefeuille per dag: saldo aan het begin van de dag × dagopening.
 * Dagen zonder koers worden overgeslagen. `days` = aantal dagen terug vanaf `endDay` (inclusief).
 */
export function valueSeries(
  histories: AddressHistory[],
  books: Partial<Record<Asset["symbol"], PriceBook>>,
  endDay: number,
  days: number,
): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const t = endDay - i * DAY;
    const key = utcDayKey(t);
    let value = 0;
    let missing = false;
    for (const h of histories) {
      const units = balanceAt(h.flows, t);
      if (units === 0n) continue;
      const price = books[h.asset.symbol]?.priceOn(key) ?? null;
      if (price === null) {
        missing = true;
        break;
      }
      value += unitsToNumber(units, h.asset.decimals) * price;
    }
    if (!missing) points.push({ t, valueEur: value });
  }
  return points;
}

export interface ActivityItem {
  /** Transactie-id (hash). */
  id: string;
  asset: Asset;
  timestamp: number;
  /** Netto saldowijziging over alle gevolgde adressen; negatief = verstuurd (incl. fee). */
  delta: bigint;
  amount: number;
  type: "receive" | "send" | "internal";
}

/**
 * Maximale netto-uitgang die nog als "alleen netwerkkosten" telt bij een overboeking tussen eigen adressen.
 * Ruim boven normale fees, ruim onder normale betalingen. Daarboven is het een verzending (met wisselgeld).
 */
export const INTERNAL_FEE_CAP: Record<Asset["symbol"], bigint> = {
  BTC: 100_000n, // 0,001 BTC
  ETH: 10n ** 16n, // 0,01 ETH
};

/**
 * Transacties over alle gevolgde adressen, nieuwste eerst. Een transactie die meerdere gevolgde adressen raakt,
 * wordt samengevoegd tot het netto effect. "internal" alleen als er geld in én uit gevolgde adressen gaat en het
 * netto verlies niet groter is dan een fee (INTERNAL_FEE_CAP); anders "send" of "receive" op basis van het teken.
 */
export function activity(histories: AddressHistory[]): ActivityItem[] {
  const byTx = new Map<string, { asset: Asset; timestamp: number; delta: bigint; ins: number; outs: number }>();
  for (const h of histories) {
    for (const f of h.flows) {
      const key = `${h.asset.symbol}:${f.id}`;
      const cur = byTx.get(key) ?? { asset: h.asset, timestamp: f.timestamp, delta: 0n, ins: 0, outs: 0 };
      cur.delta += f.delta;
      if (f.delta > 0n) cur.ins++;
      else cur.outs++;
      byTx.set(key, cur);
    }
  }
  return [...byTx.entries()]
    .map(([key, v]) => ({
      id: key.slice(key.indexOf(":") + 1),
      asset: v.asset,
      timestamp: v.timestamp,
      delta: v.delta,
      amount: unitsToNumber(v.delta < 0n ? -v.delta : v.delta, v.asset.decimals),
      type: (v.ins > 0 && v.outs > 0 && v.delta <= 0n && -v.delta <= INTERNAL_FEE_CAP[v.asset.symbol]
        ? "internal"
        : v.delta > 0n
          ? "receive"
          : "send") as ActivityItem["type"],
    }))
    .sort((a, b) => b.timestamp - a.timestamp);
}
