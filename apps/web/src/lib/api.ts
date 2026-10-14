/**
 * Client voor de KERN-API (`apps/api`). Altijd same-origin via `/v1`:
 * - lokaal proxyt Vite `/v1` naar de API (vite.config.ts);
 * - in productie hoort dezelfde origin de API te serveren (rewrite), zodat de sessiecookie
 *   `SameSite=Strict` en de CSP `connect-src 'self'` gewoon werken.
 * De server ontvangt nooit sleutels of adressen: alleen passkey-gegevens en sessies.
 */
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

export interface User {
  id: string;
  displayName: string;
}

export interface Me {
  user: User;
  passkeys: number;
}

export interface Passkey {
  credentialId: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "offline", "De server is niet bereikbaar.");
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
  // Geen JSON-foutobject: dit is niet onze API (bijv. statische host zonder API → 404/405 HTML).
  if (!res.ok && !data?.error) throw new ApiError(0, "no_api", "De server is niet bereikbaar.");
  if (!res.ok) throw new ApiError(res.status, data!.error!.code, data!.error!.message);
  return data as T;
}

/** Huidige sessie, of null als er geen (geldige) sessie is. */
export async function me(): Promise<Me | null> {
  try {
    return await call<Me>("GET", "/v1/me");
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 0 || e.status === 404 || e.status >= 500)) return null;
    throw e;
  }
}

/**
 * Achtergrondcontrole van de sessie. Verlengt de sessie op de server niet (header x-kern-session-check), zodat
 * de inactiviteitstermijn van de server blijft gelden. Alleen een 401 betekent "verlopen"; netwerk- of
 * serverfouten zijn "onbekend" en mogen niemand uitloggen.
 */
export async function checkSession(): Promise<"valid" | "expired" | "unknown"> {
  try {
    await call<Me>("GET", "/v1/me", undefined, { "x-kern-session-check": "1" });
    return "valid";
  } catch (e) {
    return e instanceof ApiError && e.status === 401 ? "expired" : "unknown";
  }
}

type Options = { challengeId: string; options: Record<string, unknown> };

export async function register(displayName: string): Promise<User> {
  const { challengeId, options } = await call<Options>("POST", "/v1/auth/register/options", { displayName });
  const response = await startRegistration({ optionsJSON: options as never });
  return (await call<{ user: User }>("POST", "/v1/auth/register/verify", { challengeId, response })).user;
}

export async function login(): Promise<User> {
  const { challengeId, options } = await call<Options>("POST", "/v1/auth/login/options");
  const response = await startAuthentication({ optionsJSON: options as never });
  return (await call<{ user: User }>("POST", "/v1/auth/login/verify", { challengeId, response })).user;
}

export const logout = () => call<void>("POST", "/v1/auth/logout");
export const passkeys = () => call<Passkey[]>("GET", "/v1/me/passkeys");
export const revokeOtherSessions = () => call<{ revoked: number }>("POST", "/v1/me/sessions/revoke-others");

/** Vertaalt fouten van WebAuthn en de API naar een vertaalsleutel voor de gebruiker. */
export function authErrorKey(e: unknown): "auth.cancelled" | "auth.unsupported" | "auth.offline" | null {
  if (e instanceof ApiError && (e.status === 0 || e.status === 404 || e.status === 405 || e.status >= 500)) return "auth.offline";
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "AbortError") return "auth.cancelled";
  if (name === "NotSupportedError") return "auth.unsupported";
  return null;
}

/** Abonnement voor het Box 3-rapport (ADR-0016). */
export interface Billing {
  enabled: boolean;
  premium: boolean;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Zoals Stripe de prijs kent (centen), zodat de UI nooit een ander bedrag noemt dan er wordt afgeschreven. */
  price: { amount: number; currency: string; interval: string } | null;
}

export const billing = () => call<Billing>("GET", "/v1/billing");
/** Haalt de status opnieuw op bij Stripe (na terugkeer van de betaalpagina of een gemiste webhook). */
export const syncBilling = () => call<Billing>("POST", "/v1/billing/sync");

/** "€ 35,00 per jaar" uit de prijs van Stripe. */
export function formatPrice(p: NonNullable<Billing["price"]>): string {
  const amount = new Intl.NumberFormat("nl-NL", { style: "currency", currency: p.currency.toUpperCase() }).format(p.amount / 100);
  const per = { year: "per jaar", month: "per maand", week: "per week", day: "per dag" }[p.interval] ?? `per ${p.interval}`;
  return `${amount} ${per}`;
}

const RETURN_PARAM = "abonnement";

/**
 * Terug van Stripe (`?abonnement=terug#/wallet`)? Geeft de schone URL terug (zonder de parameter, met hash), zodat een
 * herlaadactie niet opnieuw als terugkeer telt.
 */
export function billingReturn(href: string): { returned: boolean; cleaned: string } {
  const u = new URL(href);
  const returned = u.searchParams.get(RETURN_PARAM) === "terug";
  u.searchParams.delete(RETURN_PARAM);
  return { returned, cleaned: u.toString() };
}

/**
 * Alleen doorsturen naar Stripe zelf (https, exacte host). Zo kan een gecompromitteerde of verkeerd ingestelde
 * API de gebruiker niet naar een nagemaakte betaalpagina sturen.
 */
export function isStripeRedirect(url: string, host: "checkout.stripe.com" | "billing.stripe.com"): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === host && u.port === "" && u.username === "" && u.password === "";
  } catch {
    return false;
  }
}

async function stripeRedirect(path: string, host: "checkout.stripe.com" | "billing.stripe.com"): Promise<string> {
  const { url } = await call<{ url: string }>("POST", path);
  if (!isStripeRedirect(url, host)) throw new ApiError(0, "bad_redirect", "Onverwacht betaaladres.");
  return url;
}

export const startCheckout = () => stripeRedirect("/v1/billing/checkout", "checkout.stripe.com");
export const openBillingPortal = () => stripeRedirect("/v1/billing/portal", "billing.stripe.com");
