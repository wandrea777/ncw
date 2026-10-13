/**
 * Regels voor de sessie in de web-app. De server is leidend (sessie verloopt na 30 minuten inactiviteit en
 * 12 uur absoluut, ADR-0005); de client volgt dat, zodat er nooit een dashboard open blijft na verloop.
 */
import { ApiError } from "./api";

/** Gelijk aan SESSION_IDLE_MINUTES van de API (standaard 30). */
export const IDLE_MINUTES = 30;
/** Hoe vaak de client controleert of de sessie nog geldig is. */
export const CHECK_INTERVAL_MS = 60_000;

/** Het dashboard mag alleen met een geldige sessie. `undefined` = nog onbekend (laden). */
export function canShowWallet(session: unknown | null | undefined): boolean {
  return session !== null && session !== undefined;
}

/** True als de gebruiker langer dan IDLE_MINUTES niets heeft gedaan. */
export function idleExpired(lastActivity: number, now: number, minutes = IDLE_MINUTES): boolean {
  return now - lastActivity >= minutes * 60_000;
}

/**
 * Of een uitlogpoging als geslaagd mag gelden. Alleen als de server het bevestigt (204) of de sessie al ongeldig
 * was (401). Bij een netwerk- of serverfout blijft de sessie mogelijk geldig: dan niet doen alsof.
 */
export function logoutConfirmed(error: unknown | null): boolean {
  if (error === null) return true;
  return error instanceof ApiError && error.status === 401;
}
