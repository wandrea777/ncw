import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { loadConfig } from "./config.ts";
import { createPgDb, createPgliteDb } from "./db/db.ts";
import { migrate, pendingMigrations } from "./db/migrate.ts";
import { createPasskeyService } from "./auth/webauthn.ts";
import { createApp } from "./app.ts";

const cfg = loadConfig();
const db = cfg.databaseUrl ? createPgDb(cfg.databaseUrl) : await createPgliteDb(".data/pglite");
// Productie: de app-rol mag het schema niet wijzigen (least privilege). Migraties draaien apart als eigenaar
// (npm run migrate). De app weigert te starten als het schema niet exact overeenkomt.
if (cfg.env === "production") {
  const missing = await pendingMigrations(db);
  if (missing.length) throw new Error(`Database-schema loopt achter of wijkt af: ${missing.join(", ")}. Draai eerst de migraties als eigenaar.`);
} else {
  const applied = await migrate(db);
  if (applied.length) console.log(JSON.stringify({ msg: "migraties toegepast", applied }));
}

/**
 * Client-IP voor rate limiting (wordt nooit opgeslagen).
 *  TRUST_PROXY=cloudflare → CF-Connecting-IP (gezet door Cloudflare, niet door de client te vervalsen)
 *  TRUST_PROXY=1          → de RECHTERSTE X-Forwarded-For-waarde (toegevoegd door onze eigen proxy)
 *  anders                 → het socket-adres
 */
const trustProxy = process.env.TRUST_PROXY ?? "";
const clientIp = (c: Parameters<NonNullable<Parameters<typeof createApp>[0]["clientIp"]>>[0]) => {
  if (trustProxy === "cloudflare") return c.req.header("cf-connecting-ip") ?? "unknown";
  if (trustProxy === "1") return c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
  return getConnInfo(c).remote.address ?? "unknown";
};
const app = createApp({ db, cfg, passkeys: createPasskeyService(cfg), clientIp });

const server = serve({ fetch: app.fetch, port: cfg.port, hostname: cfg.env === "production" ? "0.0.0.0" : "127.0.0.1" }, (info) =>
  console.log(JSON.stringify({ msg: "NCW API gestart", env: cfg.env, port: info.port, db: cfg.databaseUrl ? "postgres" : "pglite" })),
);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    server.close();
    void db.close().then(() => process.exit(0));
  });
}
