import type { AddressHistory, Asset, Flow, IncomingClass } from "./types";
import { utcDayKey, type PriceSeries } from "../prices/series";

export function unitsToNumber(units: bigint, decimals: number): number {
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const n = Number(whole) + Number(frac) / Number(base);
  return neg ? -n : n;
}

export function yearBounds(year: number): { start: number; end: number } {
  return { start: Date.UTC(year, 0, 1), end: Date.UTC(year + 1, 0, 1) };
}

export function balanceAt(flows: Flow[], t: number): bigint {
  let b = 0n;
  for (const f of flows) if (f.timestamp < t) b += f.delta;
  return b;
}

export interface ValuedFlow extends Flow {
  priceEur: number;
  valueEur: number;
  direction: "in" | "uit";
  /** Interne overboeking tussen twee adressen die beide in de berekening zitten. */
  internal: boolean;
  classification: IncomingClass | null;
}

export interface AssetYearResult {
  asset: Asset;
  year: number;
  unitsBegin: number;
  unitsEnd: number;
  priceBegin: number;
  priceEnd: number;
  valueBegin: number;
  valueEnd: number;
  inbreng: number;
  onttrekking: number;
  opbrengsten: number;
  werkelijkRendement: number;
  flows: ValuedFlow[];
  warnings: string[];
  /** True als het jaar nog niet voorbij is; eindwaarde is dan indicatief. */
  indicatief: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Werkelijk rendement crypto voor één asset in één jaar:
 *   rendement = W(eind) - W(begin) - inbreng + onttrekking
 * Inkomende stromen tellen als inbreng tenzij geclassificeerd als "opbrengst".
 * Uitgaande stromen (incl. netwerkfees) tellen als onttrekking tegen dagkoers,
 * waardoor kosten niet als verlies meetellen (kosten zijn niet aftrekbaar).
 * Interne overboekingen tussen meegenomen adressen vallen tegen elkaar weg.
 */
export function valueAssetYear(params: {
  year: number;
  asset: Asset;
  histories: AddressHistory[];
  prices: PriceSeries;
  classifications: Record<string, IncomingClass>;
  now?: number;
}): AssetYearResult {
  const { year, asset, histories, prices, classifications } = params;
  const now = params.now ?? Date.now();
  const { start, end: yearEnd } = yearBounds(year);
  const indicatief = now < yearEnd;
  const end = indicatief ? now : yearEnd;
  const warnings: string[] = [];

  const allFlows = histories.flatMap((h) => h.flows);
  for (const h of histories) {
    const sum = h.flows.reduce((a, f) => a + f.delta, 0n);
    if (sum !== h.currentBalance) {
      warnings.push(
        `Saldo van ${short(h.address)} klopt niet met de transactiehistorie. De uitkomst kan onvolledig zijn.`,
      );
    }
  }

  const unitsBeginRaw = balanceAt(allFlows, start);
  const unitsEndRaw = balanceAt(allFlows, end);
  const priceBegin = prices.priceOn(utcDayKey(start));
  const priceEnd = prices.priceOn(utcDayKey(indicatief ? prices.lastDay() : end));

  // Interne overboekingen: dezelfde tx-id met zowel in- als uitstroom binnen de set.
  const byId = new Map<string, Flow[]>();
  for (const f of allFlows) byId.set(f.id, [...(byId.get(f.id) ?? []), f]);

  const yearFlows = allFlows.filter((f) => f.timestamp >= start && f.timestamp < end).sort((a, b) => a.timestamp - b.timestamp);

  let inbreng = 0;
  let onttrekking = 0;
  let opbrengsten = 0;
  const valued: ValuedFlow[] = yearFlows.map((f) => {
    const price = prices.priceOn(utcDayKey(f.timestamp));
    const value = Math.abs(unitsToNumber(f.delta, asset.decimals)) * price;
    const sameTx = byId.get(f.id) ?? [];
    const internal = sameTx.some((o) => o !== f && o.address !== f.address && Math.sign(Number(o.delta)) !== Math.sign(Number(f.delta)));
    const direction = f.delta >= 0n ? "in" : "uit";
    let classification: IncomingClass | null = null;
    if (direction === "in") {
      classification = internal ? "inbreng" : (classifications[flowKey(f)] ?? "inbreng");
      if (classification === "opbrengst") opbrengsten += value;
      else inbreng += value;
    } else {
      onttrekking += value;
    }
    return { ...f, priceEur: price, valueEur: round2(value), direction, internal, classification };
  });

  const unitsBegin = unitsToNumber(unitsBeginRaw, asset.decimals);
  const unitsEnd = unitsToNumber(unitsEndRaw, asset.decimals);
  const valueBegin = unitsBegin * priceBegin;
  const valueEnd = unitsEnd * priceEnd;

  return {
    asset,
    year,
    unitsBegin,
    unitsEnd,
    priceBegin,
    priceEnd,
    valueBegin: round2(valueBegin),
    valueEnd: round2(valueEnd),
    inbreng: round2(inbreng),
    onttrekking: round2(onttrekking),
    opbrengsten: round2(opbrengsten),
    werkelijkRendement: round2(valueEnd - valueBegin - inbreng + onttrekking),
    flows: valued,
    warnings,
    indicatief,
  };
}

export function flowKey(f: Pick<Flow, "id" | "address">): string {
  return `${f.address}:${f.id}`;
}

function short(a: string) {
  return a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}
