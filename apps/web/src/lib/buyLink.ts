/**
 * Regels van de koopknop, los van de UI zodat ze getest zijn:
 * - het adres gaat alleen mee als de gebruiker uitdrukkelijk bevestigt dat hij het zelf beheert, het een gevolgd
 *   adres van de juiste munt is, en de partner voorinvulling zonder server toestaat;
 * - een ongeldig bedrag geeft geen link (nooit stil een ander bedrag).
 */
import { ONRAMP_PARTNERS, OnrampError, buildOnrampUrl, parseEuroAmount, type Chain, type OnrampConfig } from "@ncw/core";
import type { WatchedAddress } from "./storage";

export interface BuyState {
  chain: Chain;
  amount: string;
  address: string;
  confirmedOwn: boolean;
}

export type BuyLink = { ok: true; url: string; prefilled: boolean } | { ok: false; reason: "amount" | "invalid" };

export function buyLink(cfg: OnrampConfig, s: BuyState, watched: WatchedAddress[], origin: string): BuyLink {
  const eur = parseEuroAmount(s.amount);
  if (eur === "invalid" || (eur !== null && (eur < 10 || eur > 10_000))) return { ok: false, reason: "amount" };
  const isWatched = watched.some((w) => w.chain === s.chain && w.address === s.address);
  const prefill = ONRAMP_PARTNERS[cfg.provider].prefillsAddress && s.confirmedOwn && isWatched;
  try {
    const url = buildOnrampUrl(cfg, {
      chain: s.chain,
      address: prefill ? s.address : undefined,
      eur: eur ?? undefined,
      returnUrl: `${origin}/#/wallet`,
    });
    return { ok: true, url, prefilled: prefill };
  } catch (e) {
    if (e instanceof OnrampError) return { ok: false, reason: "invalid" };
    throw e;
  }
}
