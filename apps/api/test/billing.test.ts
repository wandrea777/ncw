import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { createApp } from "../src/app.ts";
import { loadConfig, loadStripeConfig } from "../src/config.ts";
import { createPgliteDb } from "../src/db/db.ts";
import { migrate } from "../src/db/migrate.ts";
import { stripeProvider, type BillingProvider, type SubscriptionState } from "../src/billing/provider.ts";
import { ORIGIN, fakePasskeys, registerUser } from "./helpers.ts";

const STRIPE_ENV = { STRIPE_SECRET_KEY: "sk_test_1234567890abcdef", STRIPE_WEBHOOK_SECRET: "whsec_1234567890abcdef", STRIPE_PRICE_ID: "price_1234567890" };

describe("Stripe-configuratie (fail closed)", () => {
  it("staat uit zonder variabelen en eist ze alle drie samen", () => {
    expect(loadStripeConfig({}, "development")).toBeNull();
    expect(loadStripeConfig(STRIPE_ENV, "development")).toEqual({ secretKey: STRIPE_ENV.STRIPE_SECRET_KEY, webhookSecret: STRIPE_ENV.STRIPE_WEBHOOK_SECRET, priceId: STRIPE_ENV.STRIPE_PRICE_ID });
    expect(() => loadStripeConfig({ STRIPE_SECRET_KEY: STRIPE_ENV.STRIPE_SECRET_KEY }, "development")).toThrow(/horen samen/);
  });

  it("weigert een live sleutel buiten productie en een testsleutel in productie", () => {
    expect(() => loadStripeConfig({ ...STRIPE_ENV, STRIPE_SECRET_KEY: "sk_live_1234567890abcdef" }, "development")).toThrow(/live sleutel/);
    expect(() => loadStripeConfig({ ...STRIPE_ENV, STRIPE_SECRET_KEY: "rk_live_1234567890abcdef" }, "test")).toThrow(/live sleutel/);
    expect(() => loadStripeConfig(STRIPE_ENV, "production")).toThrow(/testsleutel/);
    expect(loadStripeConfig({ ...STRIPE_ENV, STRIPE_SECRET_KEY: "rk_live_1234567890abcdef" }, "production")?.secretKey).toBe("rk_live_1234567890abcdef");
  });

  it("weigert onbekende formaten (bijv. een publishable key of verwisselde variabelen)", () => {
    expect(() => loadStripeConfig({ ...STRIPE_ENV, STRIPE_SECRET_KEY: "pk_test_1234567890abcdef" }, "development")).toThrow(/onbekend formaat/);
    expect(() => loadStripeConfig({ ...STRIPE_ENV, STRIPE_WEBHOOK_SECRET: STRIPE_ENV.STRIPE_PRICE_ID }, "development")).toThrow(/WEBHOOK_SECRET/);
    expect(() => loadStripeConfig({ ...STRIPE_ENV, STRIPE_PRICE_ID: "prod_123456789" }, "development")).toThrow(/PRICE_ID/);
  });
});

describe("Stripe-webhook: echte handtekeningcontrole van de SDK", () => {
  const provider = stripeProvider({ secretKey: STRIPE_ENV.STRIPE_SECRET_KEY, webhookSecret: STRIPE_ENV.STRIPE_WEBHOOK_SECRET, priceId: STRIPE_ENV.STRIPE_PRICE_ID });
  const payload = JSON.stringify({ id: "evt_test123456", object: "event", type: "customer.subscription.updated", data: { object: { object: "subscription", id: "sub_test123456" } } });
  const header = (opts: Partial<Parameters<typeof Stripe.webhooks.generateTestHeaderString>[0]> = {}) =>
    Stripe.webhooks.generateTestHeaderString({ payload, secret: STRIPE_ENV.STRIPE_WEBHOOK_SECRET, ...opts });

  it("accepteert een geldig ondertekend event en leest alleen ID, type en abonnement", async () => {
    expect(await provider.verifyWebhook(payload, header())).toEqual({ id: "evt_test123456", type: "customer.subscription.updated", subscriptionId: "sub_test123456" });
  });

  it("weigert een gewijzigde body, een ander geheim, een oude tijdstempel en een ontbrekende header", async () => {
    await expect(provider.verifyWebhook(payload.replace("updated", "deleted"), header())).rejects.toThrow();
    await expect(provider.verifyWebhook(payload, header({ secret: "whsec_ander_geheim_123" }))).rejects.toThrow();
    await expect(provider.verifyWebhook(payload, header({ timestamp: Math.floor(Date.now() / 1000) - 3600 }))).rejects.toThrow();
    await expect(provider.verifyWebhook(payload, undefined)).rejects.toThrow();
  });
});

/** Nep-Stripe: houdt bij wat er gebeurt; een webhook is geldig als de handtekening "ok" is. */
function fakeStripe() {
  const subs = new Map<string, SubscriptionState>();
  const calls = { customers: 0, checkouts: 0, portals: 0, retrieves: 0 };
  const provider: BillingProvider = {
    async createCustomer() {
      calls.customers++;
      return `cus_test${calls.customers}abcdef`;
    },
    async createCheckout({ customerId }) {
      calls.checkouts++;
      return `https://checkout.stripe.com/c/pay/${customerId}`;
    },
    async createPortal({ customerId }) {
      calls.portals++;
      return `https://billing.stripe.com/p/session/${customerId}`;
    },
    async getSubscription(id) {
      calls.retrieves++;
      const s = subs.get(id);
      if (!s) throw new Error("onbekend");
      return s;
    },
    async verifyWebhook(raw, signature) {
      if (signature !== "ok") throw new Error("ongeldig");
      return JSON.parse(raw);
    },
  };
  return { provider, subs, calls };
}

async function setupBilling(billing: BillingProvider | null) {
  const db = await createPgliteDb();
  await migrate(db);
  const cfg = loadConfig({ NODE_ENV: "test", APP_ORIGIN: ORIGIN });
  const app = createApp({ db, cfg, passkeys: fakePasskeys, billing, log: () => {}, clientIp: () => "ip" });
  const webhook = (body: unknown, signature = "ok", headers: Record<string, string> = {}) =>
    app.request("/v1/billing/webhook", { method: "POST", headers: { "stripe-signature": signature, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { db, app, webhook };
}

const sub = (id: string, customerId: string, status = "active"): SubscriptionState => ({
  id,
  customerId,
  status,
  currentPeriodEnd: new Date("2027-10-14T00:00:00Z"),
  cancelAtPeriodEnd: false,
});

describe("abonnement: routes", () => {
  it("vraagt een sessie, en geeft 503 als betalen uit staat", async () => {
    const { app } = await setupBilling(null);
    expect((await app.request("/v1/billing")).status).toBe(401);
    const u = await registerUser(app, "Anna");
    expect((await u.c.get("/v1/billing")).body).toEqual({ enabled: false, premium: false, status: null, currentPeriodEnd: null, cancelAtPeriodEnd: false });
    expect((await u.c.post("/v1/billing/checkout")).status).toBe(503);
    expect((await u.c.post("/v1/billing/portal")).status).toBe(503);
  });

  it("checkout maakt één Stripe-klant per gebruiker en stuurt door naar Stripe", async () => {
    const { app, db } = await setupBilling(fakeStripe().provider);
    const u = await registerUser(app, "Anna");
    const a = await u.c.post("/v1/billing/checkout");
    const b = await u.c.post("/v1/billing/checkout");
    expect(a.status).toBe(200);
    expect(a.body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(b.body.url).toBe(a.body.url);
    expect(await db.query("SELECT stripe_customer_id FROM billing_customers")).toHaveLength(1);
  });

  it("de webhook zet het abonnement op de juiste gebruiker; premium alleen bij active/trialing", async () => {
    const f = fakeStripe();
    const { app, webhook } = await setupBilling(f.provider);
    const anna = await registerUser(app, "Anna");
    await anna.c.post("/v1/billing/checkout");
    f.subs.set("sub_anna123456", sub("sub_anna123456", "cus_test1abcdef"));
    expect((await webhook({ id: "evt_a12345678", type: "checkout.session.completed", subscriptionId: "sub_anna123456" })).status).toBe(200);
    const status = (await anna.c.get("/v1/billing")).body;
    expect(status).toMatchObject({ enabled: true, premium: true, status: "active", currentPeriodEnd: "2027-10-14T00:00:00.000Z" });

    for (const s of ["past_due", "canceled", "unpaid", "incomplete", "paused"]) {
      f.subs.set("sub_anna123456", sub("sub_anna123456", "cus_test1abcdef", s));
      await webhook({ id: `evt_${s.replace("_", "")}12345`, type: "customer.subscription.updated", subscriptionId: "sub_anna123456" });
      expect((await anna.c.get("/v1/billing")).body.premium, s).toBe(false);
    }
    // Met een geldig abonnement kun je niet nog eens afrekenen; zonder wel.
    f.subs.set("sub_anna123456", sub("sub_anna123456", "cus_test1abcdef", "trialing"));
    await webhook({ id: "evt_trial12345", type: "customer.subscription.updated", subscriptionId: "sub_anna123456" });
    expect((await anna.c.post("/v1/billing/checkout")).status).toBe(409);
  });

  it("haalt de status altijd vers op en verwerkt een dubbel event maar één keer", async () => {
    const f = fakeStripe();
    const { app, webhook } = await setupBilling(f.provider);
    const anna = await registerUser(app, "Anna");
    await anna.c.post("/v1/billing/checkout");
    f.subs.set("sub_anna123456", sub("sub_anna123456", "cus_test1abcdef"));
    const evt = { id: "evt_dubbel1234", type: "customer.subscription.created", subscriptionId: "sub_anna123456" };
    await webhook(evt);
    f.subs.set("sub_anna123456", sub("sub_anna123456", "cus_test1abcdef", "canceled"));
    const again = await webhook(evt);
    expect(again.status).toBe(200);
    expect(f.calls.retrieves).toBe(1);
    expect((await anna.c.get("/v1/billing")).body.premium).toBe(true);
  });

  it("negeert abonnementen van klanten die niet via KERN zijn aangemaakt, en kan er geen gebruiker aan koppelen", async () => {
    const f = fakeStripe();
    const { app, webhook, db } = await setupBilling(f.provider);
    const anna = await registerUser(app, "Anna");
    f.subs.set("sub_vreemd12345", sub("sub_vreemd12345", "cus_vreemdabcdef"));
    expect((await webhook({ id: "evt_vreemd1234", type: "customer.subscription.created", subscriptionId: "sub_vreemd12345" })).status).toBe(200);
    expect(await db.query("SELECT 1 FROM subscriptions")).toHaveLength(0);
    expect((await anna.c.get("/v1/billing")).body.premium).toBe(false);
  });

  it("een abonnement blijft bij de oorspronkelijke eigenaar, ook als Stripe het later bij een andere klant zou melden", async () => {
    const f = fakeStripe();
    const { app, webhook } = await setupBilling(f.provider);
    const anna = await registerUser(app, "Anna");
    const bob = await registerUser(app, "Bob");
    await anna.c.post("/v1/billing/checkout"); // cus_test1
    await bob.c.post("/v1/billing/checkout"); // cus_test2
    f.subs.set("sub_anna123456", sub("sub_anna123456", "cus_test1abcdef"));
    await webhook({ id: "evt_eerst12345", type: "customer.subscription.created", subscriptionId: "sub_anna123456" });
    f.subs.set("sub_anna123456", sub("sub_anna123456", "cus_test2abcdef"));
    await webhook({ id: "evt_daarna1234", type: "customer.subscription.updated", subscriptionId: "sub_anna123456" });
    expect((await bob.c.get("/v1/billing")).body.premium).toBe(false);
    expect((await anna.c.get("/v1/billing")).body.premium).toBe(true);
  });

  it("weigert een webhook zonder geldige handtekening; alleen de webhook mag zonder Origin", async () => {
    const f = fakeStripe();
    const { app, webhook } = await setupBilling(f.provider);
    expect((await webhook({ id: "evt_x12345678", type: "x" }, "fout")).status).toBe(400);
    expect((await webhook({ id: "evt_x12345678", type: "x" }, "")).status).toBe(400);
    expect((await webhook({ id: "geen-evt", type: "x" })).status).toBe(400);
    // Geen Origin-header: de webhook mag, andere wijzigende verzoeken niet (CSRF-controle blijft gelden).
    expect((await webhook({ id: "evt_ok12345678", type: "invoice.paid" })).status).toBe(200);
    const anna = await registerUser(app, "Anna");
    const noOrigin = await app.request("/v1/billing/checkout", { method: "POST", headers: { cookie: anna.c.cookie } });
    expect(noOrigin.status).toBe(403);
    const otherPath = await app.request("/v1/billing/webhook/", { method: "POST", headers: { "stripe-signature": "ok" }, body: "{}" });
    expect([403, 404]).toContain(otherPath.status);
  });

  it("het klantportaal vraagt eerst een klant", async () => {
    const f = fakeStripe();
    const { app } = await setupBilling(f.provider);
    const anna = await registerUser(app, "Anna");
    expect((await anna.c.post("/v1/billing/portal")).status).toBe(404);
    await anna.c.post("/v1/billing/checkout");
    const p = await anna.c.post("/v1/billing/portal");
    expect(p.status).toBe(200);
    expect(p.body.url).toMatch(/^https:\/\/billing\.stripe\.com\//);
  });
});
