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
