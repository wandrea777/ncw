/**
 * Configuratie van de koopknop (ADR-0014). Alleen publieke waarden: de partnersleutel is bedoeld voor de browser.
 *   VITE_ONRAMP_PROVIDER = ramp | moonpay
 *   VITE_ONRAMP_ENV      = demo | production   (standaard: demo, behalve in een productie-build)
 *   VITE_ONRAMP_KEY      = publieke partnersleutel (Ramp hostApiKey of MoonPay pk_…)
 * Zonder sleutel is de knop zichtbaar maar eerlijk "nog niet actief".
 */
import { isValidPartnerKey, type OnrampConfig } from "@ncw/core";

export function onrampConfig(env: Record<string, string | boolean | undefined> = import.meta.env): OnrampConfig | null {
  const provider = env.VITE_ONRAMP_PROVIDER === "moonpay" ? "moonpay" : env.VITE_ONRAMP_PROVIDER === "ramp" ? "ramp" : null;
  const publicKey = typeof env.VITE_ONRAMP_KEY === "string" ? env.VITE_ONRAMP_KEY : "";
  if (!provider || !isValidPartnerKey(publicKey)) return null;
  const e = env.VITE_ONRAMP_ENV;
  if (e !== undefined && e !== "" && e !== "demo" && e !== "production") return null; // onbekend: niet actief (build faalt ook)
  const mode = e === "production" || ((e === undefined || e === "") && env.PROD === true) ? "production" : "demo";
  return { provider, env: mode, publicKey };
}
