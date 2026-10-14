import { OpenAPIHono } from "@hono/zod-openapi";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import type { Config } from "./config.ts";
import type { Db } from "./db/db.ts";
import type { PasskeyService } from "./auth/webauthn.ts";
import { requireSession, type AppEnv } from "./auth/session.ts";
import { ApiError } from "./lib/errors.ts";
import { rateLimit } from "./lib/ratelimit.ts";
import { registerAuthRoutes } from "./routes/auth.ts";
import { registerOrgRoutes } from "./routes/orgs.ts";
import { registerVaultRoutes } from "./routes/vaults.ts";
import { WEBHOOK_PATH, registerBillingRoutes } from "./routes/billing.ts";
import type { BillingProvider } from "./billing/provider.ts";

export interface Deps {
  db: Db;
  cfg: Config;
  passkeys: PasskeyService;
  /** Stripe (ADR-0016). Ontbreekt of `null`: betalen staat uit, de endpoints geven 503. */
  billing?: BillingProvider | null;
  /** Haalt het client-IP op; alleen gebruikt voor rate limiting, nooit opgeslagen. */
  clientIp?: (c: Context) => string;
  log?: (entry: Record<string, unknown>) => void;
}

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function createApp(deps: Deps) {
  const { db, cfg } = deps;
  const log = deps.log ?? ((e) => console.log(JSON.stringify(e)));
  const ip = deps.clientIp ?? (() => "unknown");

  const app = new OpenAPIHono<AppEnv>({
    // Validatiefouten: geef paden en meldingen terug, nooit de ingevoerde waarden.
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            error: {
              code: "validation_error",
              message: "Ongeldige invoer.",
              issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
              requestId: c.get("requestId" as never),
            },
          },
          400,
        );
      }
    },
  });

  app.use("*", requestId());
  app.use("*", async (c, next) => {
    const start = performance.now();
    await next();
    // Geen IP, query string, body of cookies in de logs.
    log({ t: new Date().toISOString(), rid: c.get("requestId" as never), method: c.req.method, route: c.req.routePath, status: c.res.status, ms: Math.round(performance.now() - start) });
  });
  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      strictTransportSecurity: "max-age=63072000; includeSubDomains; preload",
      referrerPolicy: "no-referrer",
      crossOriginResourcePolicy: "same-site",
    }),
  );
  app.use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  });
  app.use("/v1/*", cors({ origin: cfg.origin, credentials: true, allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"], maxAge: 600 }));
  app.use("*", bodyLimit({ maxSize: 256 * 1024, onError: () => { throw new ApiError(413, "too_large", "Verzoek te groot."); } }));

  // CSRF: elke wijzigende request moet van onze eigen origin komen (naast SameSite=Strict cookies).
  // Enige uitzondering: de Stripe-webhook (server-naar-server, geen cookies, geauthenticeerd met een handtekening).
  app.use("/v1/*", async (c, next) => {
    const stripeWebhook = c.req.method === "POST" && c.req.path === WEBHOOK_PATH;
    if (UNSAFE.has(c.req.method) && !stripeWebhook && c.req.header("origin") !== cfg.origin) {
      throw new ApiError(403, "bad_origin", "Verzoek van onbekende herkomst geweigerd.");
    }
    await next();
  });

  // Strengst voor anonieme inlog/registratie; step-up is al ingelogd en krijgt een eigen, ruimere limiet.
  const authLimit = rateLimit({ name: "auth", capacity: 10, refillPerMinute: 10, key: ip });
  app.use("/v1/auth/register/*", authLimit);
  app.use("/v1/auth/login/*", authLimit);
  app.use("/v1/auth/step-up/*", rateLimit({ name: "stepup", capacity: 30, refillPerMinute: 30, key: ip }));
  // De Stripe-webhook krijgt een eigen bucket: anders kan iemand achter hetzelfde (proxy-)IP de webhook met 429 vertragen.
  const apiLimit = rateLimit({ name: "api", capacity: 120, refillPerMinute: 120, key: ip });
  const webhookLimit = rateLimit({ name: "stripe-webhook", capacity: 600, refillPerMinute: 600, key: ip });
  app.use("/v1/*", (c, next) => (c.req.path === WEBHOOK_PATH ? webhookLimit(c, next) : apiLimit(c, next)));

  app.get("/health", async (c) => {
    await db.query("SELECT 1");
    return c.json({ status: "ok" });
  });

  registerAuthRoutes(app, deps);

  // Alles hieronder vereist een geldige sessie.
  for (const p of ["/v1/orgs", "/v1/orgs/*", "/v1/vaults/*", "/v1/proposals/*", "/v1/invitations/*"]) app.use(p, requireSession(db, cfg));
  registerOrgRoutes(app, deps);
  registerVaultRoutes(app, deps);
  registerBillingRoutes(app, { ...deps, billing: deps.billing ?? null });

  app.doc31("/v1/openapi.json", {
    openapi: "3.1.0",
    info: { title: "NCW API", version: "0.1.0", description: "Zero-knowledge coördinatie-API voor non-custodial multisig-kluizen." },
  });

  app.notFound((c) => c.json({ error: { code: "not_found", message: "Niet gevonden." } }, 404));
  app.onError((err, c) => {
    const rid = c.get("requestId" as never);
    if (err instanceof ApiError) return c.json({ error: { code: err.code, message: err.message, requestId: rid } }, err.status);
    if (err instanceof HTTPException) return c.json({ error: { code: "http_error", message: "Verzoek kon niet worden verwerkt.", requestId: rid } }, err.status);
    log({ t: new Date().toISOString(), rid, level: "error", error: err instanceof Error ? `${err.name}: ${err.message}` : "unknown" });
    return c.json({ error: { code: "internal", message: "Er ging iets mis.", requestId: rid } }, 500);
  });

  return app;
}
