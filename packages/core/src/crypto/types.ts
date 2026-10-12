import type { Chain } from "../chains/address";

export interface Asset {
  symbol: "BTC" | "ETH";
  decimals: number;
  chain: Chain;
}

export const ASSETS: Record<Chain, Asset> = {
  bitcoin: { symbol: "BTC", decimals: 8, chain: "bitcoin" },
  ethereum: { symbol: "ETH", decimals: 18, chain: "ethereum" },
};

/** Saldowijziging op één adres. `delta` in kleinste eenheid (sat / wei), negatief = uitgaand (incl. fee). */
export interface Flow {
  id: string;
  address: string;
  timestamp: number; // unix ms
  delta: bigint;
}

/**
 * Classificatie van inkomende stromen. Bepaalt of de ontvangst als
 * aankoop/inbreng telt (geen rendement) of als opbrengst (wel rendement).
 */
export type IncomingClass = "inbreng" | "opbrengst";

export interface AddressHistory {
  address: string;
  asset: Asset;
  /** Alle bevestigde flows, oplopend op tijd. */
  flows: Flow[];
  /** Huidig saldo zoals gerapporteerd door de bron (voor consistentiecheck). */
  currentBalance: bigint;
}
