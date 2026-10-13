/**
 * Kopen via een partner met MiCA-vergunning (doorverwijzing, ADR-0014).
 *
 * KERN bouwt alleen een link naar de partner. De partner sluit de overeenkomst met de gebruiker, doet de
 * identiteitscontrole (KYC), verwerkt de betaling en levert de crypto rechtstreeks op het adres van de gebruiker.
 * KERN ontvangt, bewaart of verplaatst nooit geld of crypto, en geeft geen orders door aan de partner: de gebruiker
 * rondt de aankoop zelf af op de site van de partner. De link wordt in de browser gemaakt; onze server ziet hem niet.
 */
import { checkAddress, type Chain } from "../chains/address";

export type OnrampProvider = "ramp" | "moonpay";
export type OnrampEnv = "demo" | "production";

export interface OnrampConfig {
  provider: OnrampProvider;
  env: OnrampEnv;
  /** Publieke partnersleutel (Ramp: hostApiKey, MoonPay: publishable key "pk_…"). Geen geheim. */
  publicKey: string;
}

export interface OnrampRequest {
  chain: Chain;
  /** Ontvangstadres van de gebruiker. Wordt alleen meegegeven als de partner dat zonder server-ondertekening toestaat. */
  address?: string;
  /** Bedrag in hele euro's (optioneel), 10–10.000. */
  eur?: number;
  /** Terugkeer-URL na afronden (https). */
  returnUrl?: string;
}

export interface OnrampPartner {
  provider: OnrampProvider;
  name: string;
  /** Juridische entiteit, vergunning en register, zoals gevonden op 2026-10-14 (vóór activeren controleren: control MICA-3). */
  entity: string;
  license: string;
  register: string;
  /** Of het ontvangstadres vooraf kan worden ingevuld zonder dat onze server de link moet ondertekenen. */
  prefillsAddress: boolean;
}

export const ONRAMP_PARTNERS: Record<OnrampProvider, OnrampPartner> = {
  ramp: {
    provider: "ramp",
    name: "Ramp Network",
    entity: "Ramp Swaps (Ireland) Limited",
    license: "MiCA-vergunning (CASP), Ierland, 2 december 2025: wisselen van crypto tegen geld",
    register: "ESMA interim MiCA-register (CASP)",
    prefillsAddress: true,
  },
  moonpay: {
    provider: "moonpay",
    name: "MoonPay",
    entity: "MoonPay Europe B.V.",
    license: "MiCA-vergunning (CASP), AFM Nederland, 30 december 2024",
    register: "AFM-register cryptopartijen",
    // MoonPay vereist een server-handtekening als het adres in de link staat. Dan zou onze server adressen zien
    // (zero-knowledge, ADR-0004). Daarom geen voorinvulling: de gebruiker plakt zijn adres bij MoonPay.
    prefillsAddress: false,
  },
};

const HOSTS: Record<OnrampProvider, Record<OnrampEnv, string>> = {
  ramp: { demo: "https://app.demo.rampnetwork.com/", production: "https://app.rampnetwork.com/" },
  moonpay: { demo: "https://buy-sandbox.moonpay.com/", production: "https://buy.moonpay.com/" },
};

/** Hosts waar de koopknop naartoe mag linken (voor tests en documentatie). */
export const ONRAMP_HOSTS = Object.values(HOSTS).flatMap((h) => Object.values(h));

const RAMP_ASSET: Record<Chain, string> = { bitcoin: "BTC_BTC", ethereum: "ETH_ETH" };
const MOONPAY_ASSET: Record<Chain, string> = { bitcoin: "btc", ethereum: "eth" };

export class OnrampError extends Error {}

/** Publieke partnersleutel: letters, cijfers, _ en -, 8–128 tekens. */
export function isValidPartnerKey(key: string): boolean {
  return /^[\w-]{8,128}$/.test(key);
}

/** Leest een bedrag in hele euro's. "12,50" en "1.000" worden geweigerd in plaats van stil ×100 te worden. */
export function parseEuroAmount(input: string): number | null | "invalid" {
  const s = input.trim();
  if (s === "") return null;
  if (!/^\d{1,5}$/.test(s)) return "invalid";
  return Number(s);
}

function httpsOrNull(u: string | undefined): string | null {
  if (!u) return null;
  try {
    return new URL(u).protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/**
 * Bouwt de link naar de partner. Valideert alles: een ongeldig adres of bedrag geeft een fout, nooit een link
 * naar een verkeerd adres. Er gaat geen persoonsgegeven mee behalve (bij Ramp, op verzoek) het ontvangstadres.
 */
export function buildOnrampUrl(cfg: OnrampConfig, req: OnrampRequest): string {
  if (!isValidPartnerKey(cfg.publicKey)) throw new OnrampError("Ongeldige of ontbrekende partnersleutel.");
  if (req.eur !== undefined && (!Number.isInteger(req.eur) || req.eur < 10 || req.eur > 10_000)) {
    throw new OnrampError("Bedrag moet een heel getal tussen €10 en €10.000 zijn.");
  }
  let address: string | undefined;
  if (req.address !== undefined) {
    const r = checkAddress(req.address);
    if (!r.ok || r.chain !== req.chain) throw new OnrampError("Het ontvangstadres hoort niet bij deze munt of is ongeldig.");
    address = r.normalized;
  }
  const url = new URL(HOSTS[cfg.provider][cfg.env]);
  const p = url.searchParams;
  if (cfg.provider === "ramp") {
    p.set("hostApiKey", cfg.publicKey);
    p.set("hostAppName", "KERN");
    // Geen hostLogoUrl: dan zou de partnerpagina het logo bij onze host ophalen (spoor in onze logs, en CORP blokkeert
    // het toch). Het logo stellen we in via het partnerdashboard.
    p.set("enabledFlows", "ONRAMP");
    p.set("enabledCryptoAssets", RAMP_ASSET[req.chain]);
    p.set("fiatCurrency", "EUR");
    if (req.eur !== undefined) p.set("fiatValue", String(req.eur));
    p.set("selectedCountryCode", "NL");
    if (address) p.set("userAddress", address);
    const back = httpsOrNull(req.returnUrl);
    if (back) p.set("finalUrl", back);
  } else {
    p.set("apiKey", cfg.publicKey);
    p.set("currencyCode", MOONPAY_ASSET[req.chain]);
    p.set("baseCurrencyCode", "eur");
    if (req.eur !== undefined) p.set("baseCurrencyAmount", String(req.eur));
    const back = httpsOrNull(req.returnUrl);
    if (back) p.set("redirectURL", back);
    // Bewust geen walletAddress (zie prefillsAddress).
  }
  return url.toString();
}
