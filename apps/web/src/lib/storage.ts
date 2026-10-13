/**
 * Enige plek in de web-app die lokale opslag gebruikt (compliance-check COOK-1 staat alleen dit bestand toe).
 * Wat: de publieke adressen die de gebruiker zelf toevoegt om te volgen, per account, alleen op dit apparaat.
 * Waarom toegestaan zonder cookiebanner: strikt noodzakelijk voor een dienst waar de gebruiker uitdrukkelijk om vraagt
 * (Telecommunicatiewet art. 11.7a lid 3 sub b). Geen tracking, geen identifiers, nooit sleutels of herstelzinnen.
 * Zero-knowledge: de server ziet deze adressen nooit.
 */
import { checkAddress, type Chain } from "@ncw/core";

export interface WatchedAddress {
  address: string;
  chain: Chain;
  label?: string;
  addedAt: number;
}

const key = (userId: string) => `kern.watch.v1.${userId}`;

/**
 * Opslag is niet vertrouwd (extensies, malware of iemand aan het apparaat kunnen hem wijzigen). Elk adres wordt
 * opnieuw gecontroleerd met checkAddress (checksum) en moet exact de genormaliseerde vorm en de juiste chain hebben;
 * anders wordt het genegeerd. Zo kan een gemanipuleerde opslag geen ongeldig of bewerkt adres als ontvangstadres tonen.
 */
function isWatched(x: unknown): x is WatchedAddress {
  const w = x as WatchedAddress;
  if (typeof w !== "object" || w === null || typeof w.address !== "string" || w.address.length > 100) return false;
  if (typeof w.addedAt !== "number" || !(w.label === undefined || (typeof w.label === "string" && w.label.length <= 40))) return false;
  const r = checkAddress(w.address);
  return r.ok && r.normalized === w.address && r.chain === w.chain;
}

export function loadWatched(userId: string): WatchedAddress[] {
  try {
    const raw = window.localStorage.getItem(key(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isWatched) : [];
  } catch {
    return [];
  }
}

export function saveWatched(userId: string, list: WatchedAddress[]): void {
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(list));
  } catch {
    /* opslag geblokkeerd (privévenster): lijst blijft voor deze sessie in het geheugen */
  }
}

/** Wist alles wat KERN op dit apparaat bewaart (gedeeld apparaat). */
export function clearDevice(): void {
  try {
    for (const k of Object.keys(window.localStorage)) if (k.startsWith("kern.")) window.localStorage.removeItem(k);
  } catch {
    /* negeren */
  }
}

/** Taalkeuze (NL/EN): functionele voorkeur, geen identifier. */
export function loadLang(): "NL" | "EN" | null {
  try {
    const v = window.localStorage.getItem("kern.lang");
    return v === "NL" || v === "EN" ? v : null;
  } catch {
    return null;
  }
}

export function saveLang(lang: "NL" | "EN"): void {
  try {
    window.localStorage.setItem("kern.lang", lang);
  } catch {
    /* negeren */
  }
}
