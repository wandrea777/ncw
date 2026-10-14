export interface Config {
  env: "development" | "test" | "production";
  port: number;
  /** PostgreSQL-URL. Leeg in ontwikkeling → lokale PGlite in .data/. */
  databaseUrl: string | null;
  /** WebAuthn Relying Party: domein zonder schema, bijv. "app.voorbeeld.nl". */
  rpId: string;
  rpName: string;
  /** Exacte origin van de web-app, bijv. "https://app.voorbeeld.nl". Wordt ook gebruikt voor CSRF-controle. */
  origin: string;
  sessionTtlHours: number;
  sessionIdleMinutes: number;
  /** Stripe-abonnement (ADR-0016). `null` = betalen staat uit; de rest van de app werkt gewoon. */
  stripe: StripeConfig | null;
}

export interface StripeConfig {
  /** Bij voorkeur een restricted key (`rk_`) met alleen de rechten uit ADR-0016. */
  secretKey: string;
  webhookSecret: string;
  priceId: string;
}

/**
 * Alle drie of geen. Fail closed: een live sleutel buiten productie of een testsleutel in productie weigert te starten,
 * zodat niemand per ongeluk echte betalingen in een testomgeving (of nep-betalingen in productie) verwerkt.
 */
export function loadStripeConfig(env: NodeJS.ProcessEnv, mode: Config["env"]): StripeConfig | null {
  const secretKey = env.STRIPE_SECRET_KEY ?? "";
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET ?? "";
  const priceId = env.STRIPE_PRICE_ID ?? "";
  const set = [secretKey, webhookSecret, priceId].filter(Boolean).length;
  if (set === 0) return null;
  const problems: string[] = [];
  if (set !== 3) problems.push("STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET en STRIPE_PRICE_ID horen samen");
  const live = /^(sk|rk)_live_[A-Za-z0-9]{10,}$/.test(secretKey);
  const test = /^(sk|rk)_test_[A-Za-z0-9]{10,}$/.test(secretKey);
  if (secretKey && !live && !test) problems.push("STRIPE_SECRET_KEY heeft een onbekend formaat");
  if (mode === "production" && test) problems.push("testsleutel van Stripe in productie");
  if (mode !== "production" && live) problems.push("live sleutel van Stripe buiten productie");
  if (webhookSecret && !/^whsec_[A-Za-z0-9]{10,}$/.test(webhookSecret)) problems.push("STRIPE_WEBHOOK_SECRET heeft een onbekend formaat");
  if (priceId && !/^price_[A-Za-z0-9]{6,}$/.test(priceId)) problems.push("STRIPE_PRICE_ID heeft een onbekend formaat");
  if (problems.length) throw new Error(`Onveilige Stripe-configuratie: ${problems.join("; ")}`);
  return { secretKey, webhookSecret, priceId };
}

const MODES = ["development", "test", "production"] as const;

function int(name: string, value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} moet een geheel getal tussen ${min} en ${max} zijn`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const rawMode = env.NODE_ENV ?? "development";
  // Fail closed: een onbekende waarde (bijv. "prod" of "staging") mag nooit stil op ontwikkelinstellingen draaien.
  if (!(MODES as readonly string[]).includes(rawMode)) throw new Error(`Onbekende NODE_ENV "${rawMode}". Toegestaan: ${MODES.join(", ")}`);
  const mode = rawMode as Config["env"];
  const cfg: Config = {
    env: mode,
    port: int("PORT", env.PORT, 8787, 1, 65535),
    databaseUrl: env.DATABASE_URL ?? null,
    rpId: env.RP_ID ?? "localhost",
    rpName: env.RP_NAME ?? "KERN",
    origin: env.APP_ORIGIN ?? "http://localhost:5188",
    sessionTtlHours: int("SESSION_TTL_HOURS", env.SESSION_TTL_HOURS, 12, 1, 24),
    sessionIdleMinutes: int("SESSION_IDLE_MINUTES", env.SESSION_IDLE_MINUTES, 30, 5, 120),
    stripe: loadStripeConfig(env, mode),
  };
  if (mode === "production") {
    const problems: string[] = [];
    if (!cfg.databaseUrl) problems.push("DATABASE_URL ontbreekt");
    if (!cfg.origin.startsWith("https://")) problems.push("APP_ORIGIN moet https zijn");
    if (cfg.rpId === "localhost") problems.push("RP_ID moet het echte domein zijn");
    if (cfg.databaseUrl?.includes("sslmode=disable")) problems.push("Database zonder TLS is niet toegestaan");
    if (problems.length) throw new Error(`Onveilige productieconfiguratie: ${problems.join("; ")}`);
  }
  return cfg;
}
