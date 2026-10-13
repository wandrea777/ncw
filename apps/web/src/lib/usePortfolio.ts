import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ASSETS,
  activity,
  fetchBitcoinHistory,
  fetchDailyEurPrices,
  fetchEthereumHistory,
  priceBook,
  snapshot,
  type AddressHistory,
  type Asset,
  type PriceBook,
  type PriceSeries,
  type Snapshot,
} from "@ncw/core";
import type { WatchedAddress } from "./storage";

export interface Portfolio {
  histories: AddressHistory[];
  books: Partial<Record<Asset["symbol"], PriceBook>>;
  snap: Snapshot;
  items: ReturnType<typeof activity>;
}

export interface AddressError {
  address: string;
  message: string;
}

/** Eerste jaar met EUR-koersen bij Binance. */
const FIRST_PRICE_YEAR = 2020;

const historyKey = (w: Pick<WatchedAddress, "chain" | "address">) => `${w.chain}:${w.address}`;

/**
 * Haalt saldi en geschiedenis van de gevolgde adressen op (mempool.space / Blockscout) en EUR-dagkoersen (Binance),
 * rechtstreeks vanuit de browser.
 * - Fouten zijn per adres geïsoleerd: één onbereikbaar of te groot adres breekt de rest niet.
 * - Geschiedenis en koersen worden per adres en per jaar in het geheugen bewaard; een andere periode kiezen
 *   haalt alleen ontbrekende koersjaren op.
 */
export function usePortfolio(watched: WatchedAddress[], years: number | "all") {
  const histCache = useRef(new Map<string, AddressHistory>());
  const priceCache = useRef(new Map<string, PriceSeries>());
  // Geschiedenis hoort bij een specifieke set adressen (key); oude data van een andere set telt niet.
  const [loaded, setLoaded] = useState<{ key: string; list: AddressHistory[] } | null>(null);
  const [books, setBooks] = useState<Portfolio["books"] | null>(null);
  const [errors, setErrors] = useState<AddressError[]>([]);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => {
    histCache.current.clear();
    priceCache.current.clear();
    setNonce((n) => n + 1);
  }, []);
  const watchKey = watched.map(historyKey).join(",");

  // 1. Geschiedenis per adres (alleen opnieuw bij andere adressen of "Vernieuwen").
  useEffect(() => {
    let cancelled = false;
    setHistLoading(true);
    (async () => {
      const errs: AddressError[] = [];
      for (const w of watched) {
        if (histCache.current.has(historyKey(w))) continue;
        try {
          const h = w.chain === "bitcoin" ? await fetchBitcoinHistory(w.address) : await fetchEthereumHistory(w.address);
          histCache.current.set(historyKey(w), h);
        } catch (e) {
          errs.push({ address: w.address, message: e instanceof Error ? e.message : String(e) });
        }
        if (cancelled) return;
      }
      if (cancelled) return;
      setErrors(errs);
      setLoaded({ key: watchKey, list: watched.map((w) => histCache.current.get(historyKey(w))).filter((h): h is AddressHistory => !!h) });
    })().finally(() => !cancelled && setHistLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchKey, nonce]);

  const histories = loaded && loaded.key === watchKey ? loaded.list : null;

  // 2. Koersen per asset en jaar (alleen ontbrekende jaren).
  useEffect(() => {
    if (!histories) return;
    let cancelled = false;
    const now = new Date().getUTCFullYear();
    const firstFlow = Math.min(...histories.flatMap((h) => h.flows.map((f) => f.timestamp)), Date.now());
    const from =
      years === "all" ? Math.max(FIRST_PRICE_YEAR, new Date(firstFlow).getUTCFullYear()) : Math.max(FIRST_PRICE_YEAR, now - years);
    const symbols = [...new Set(histories.map((h) => h.asset.symbol))];
    setPriceLoading(true);
    (async () => {
      const out: Portfolio["books"] = {};
      for (const symbol of symbols) {
        const series: PriceSeries[] = [];
        for (let y = now; y >= from; y--) {
          const key = `${symbol}:${y}`;
          if (!priceCache.current.has(key)) priceCache.current.set(key, await fetchDailyEurPrices(symbol, y));
          if (cancelled) return;
          series.push(priceCache.current.get(key)!);
        }
        out[symbol] = priceBook(series);
      }
      if (!cancelled) {
        setBooks(out);
        setPriceError(null);
      }
    })()
      .catch((e: unknown) => !cancelled && setPriceError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setPriceLoading(false));
    return () => {
      cancelled = true;
    };
  }, [histories, years]);

  const data = useMemo<Portfolio | null>(() => {
    if (watched.length === 0) return { histories: [], books: {}, snap: snapshot([], {}), items: [] };
    if (!histories || !books) return null;
    // Nog niet alle koersen binnen (bijv. net een ETH-adres toegevoegd): nog niets tonen in plaats van een deeltotaal.
    if (histories.some((h) => !books[h.asset.symbol])) return null;
    try {
      return { histories, books, snap: snapshot(histories, books), items: activity(histories) };
    } catch {
      return null;
    }
  }, [watched.length, histories, books]);

  return { data, loading: histLoading || priceLoading, errors, priceError, reload };
}
