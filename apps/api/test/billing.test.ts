import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { loadStripeConfig } from "../src/config.ts";
import { stripeProvider, type BillingProvider, type SubscriptionState } from "../src/billing/provider.ts";
import { registerUser, setup } from "./helpers.ts";

const PRICE = "price_1234567890";
const STRIPE_ENV = { STRIPE_SECRET_KEY: "sk_test_1234567890abcdef", STRIPE_WEBHOOK_SECRET: "whsec_1234567890abcdef", STRIPE_PRICE_ID: PRICE };

describe("Stripe-configuratie (fail closed)", () => {
  it("staat uit zonder variabelen en eist ze alle drie samen", () => {
    expect(loadStripeConfig({}, "development")).toBeNull();
    expect(loadStripeConfig(STRIPE_ENV, "development")).toEqual({ secretKey: STRIPE_ENV.STRIPE_SECRET_KEY, webhookSecret: STRIPE_ENV.STRIPE_WEBHOOK_SECRET, priceId: PRICE });
    expect(() => loadStripeConfig({ STRIPE_SECRET_KEY: STRIPE_ENV.STRIPE_SECRET_KEY }, "development")).toThrow(/horen samen/);
  });

  it("weigert live sleutels buiten productie, testsleutels in productie, en in productie alles behalve een restricted key", () => {
    expect(() => loadStripeConfig({ ...STRIPE_ENV, STRIPE_SECRET_KEY: "sk_live_1234567890abcdef" }, "development")).toThrow(/live sleutel/);
    expect(() => loadStripeConfig({ ...STRIPE_ENV, STRIPE_SECRET_KEY: "rk_live_1234567890abcdef" }, "test")).toThrow(/live sleutel/);
    expect(() => loadStripeConfig(STRIPE_ENV, "production")).toThrow(/testsleutel/);
    expect(() => loadStripeConfig({ ...STRIPE_ENV, STRIPE_SECRET_KEY: "sk_live_1234567890abcdef" }, "production")).toThrow(/restricted key/);
    expect(loadStripeConfig({ ...STRIPE_ENV, STRIPE_SECRET_KEY: "rk_live_1234567890abcdef" }, "production")?.secretKey).toBe("rk_live_1234567890abcdef");
  });

  it("weigert onbekende formaten (bijv. een publishable key of verwisselde variabelen)", () => {
    expect(() => loadStripeConfig({ ...STRIPE_ENV, STRIPE_SECRET_KEY: "pk_test_1234567890abcdef" }, "development")).toThrow(/onbekend formaat/);
    expect(() => loadStripeConfig({ ...STRIPE_ENV, STRIPE_WEBHOOK_SECRET: PRICE }, "development")).toThrow(/WEBHOOK_SECRET/);
    expect(() => loadStripeConfig({ ...STRIPE_ENV, STRIPE_PRICE_ID: "prod_123456789" }, "development")).toThrow(/PRICE_ID/);
  });
});

describe("Stripe-webhook: echte handtekeningcontrole van de SDK", () => {
  const provider = stripeProvider({ secretKey: STRIPE_ENV.STRIPE_SECRET_KEY, webhookSecret: STRIPE_ENV.STRIPE_WEBHOOK_SECRET, priceId: PRICE });
  const payload = JSON.stringify({ id: "evt_test123456", object: "event", type: "customer.subscription.updated", data: { object: { object: "subscription", id: "sub_test123456" } } });
  const header = (opts: Partial<Parameters<typeof Stripe.webhooks.generateTestHeaderString>[0]> = {}) =>
    Stripe.webhooks.generateTestHeaderString({ payload, secret: STRIPE_ENV.STRIPE_WEBHOOK_SECRET, ...opts });

  it("accepteert een geldig ondertekend event en leest alleen ID, type en abonnement", async () => {
    expect(await provider.verifyWebhook(payload, header())).toEqual({ id: "evt_test123456", type: "customer.subscription.updated", subscriptionId: "sub_test123456" });
  });

  it("leest het abonnement ook uit een afgeronde checkout-sessie", async () => {
    const body = JSON.stringify({ id: "evt_test654321", object: "event", type: "checkout.session.completed", data: { object: { object: "checkout.session", subscription: "sub_uitsessie12" } } });
    const sig = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: STRIPE_ENV.STRIPE_WEBHOOK_SECRET });
    expect((await provider.verifyWebhook(body, sig)).subscriptionId).toBe("sub_uitsessie12");
  });

  it("weigert een gewijzigde body, een ander geheim, een oude tijdstempel en een ontbrekende header", async () => {
    await expect(provider.verifyWebhook(payload.replace("updated", "deleted"), header())).rejects.toThrow();
    await expect(provider.verifyWebhook(payload, header({ secret: "whsec_ander_geheim_123" }))).rejects.toThrow();
    await expect(provider.verifyWebhook(payload, header({ timestamp: Math.floor(Date.now() / 1000) - 3600 }))).rejects.toThrow();
    await expect(provider.verifyWebhook(payload, undefined)).rejects.toThrow();
  });
});

/** Nep-Stripe: abonnementen per ID; een webhook is geldig als de handtekening "ok" is. */
function fakeStripe() {
  const subs = new Map<string, SubscriptionState>();
  const calls = { customers: 0, checkouts: 0, retrieves: 0 };
  let failNext = false;
  /** Laat de eerstvolgende opvraag de status lezen en dan wachten tot `release()` (om een race na te bootsen). */
  let gate: { release(): void; wait: Promise<void> } | null = null;
  const provider: BillingProvider = {
    async createCustomer() {
      calls.customers++;
      await new Promise((r) => setTimeout(r, 5));
      return `cus_test${calls.customers}abcdef`;
    },
    async createCheckout({ customerId }) {
      calls.checkouts++;
      return `https://checkout.stripe.com/c/pay/cs_test_${calls.checkouts}_${customerId}`;
    },
    async createPortal({ customerId }) {
      return `https://billing.stripe.com/p/session/${customerId}`;
    },
    async getSubscription(id) {
      calls.retrieves++;
      if (failNext) throw ((failNext = false), new Error("Stripe onbereikbaar"));
      const s = subs.get(id);
      if (!s) throw new Error("onbekend");
      const snapshot = { ...s };
      if (gate) {
        const g = gate;
        gate = null;
        await g.wait;
      }
      return snapshot;
    },
    async listSubscriptions(customerId) {
      return [...subs.values()].filter((s) => s.customerId === customerId);
    },
    async getPrice() {
      return { amount: 3500, currency: "eur", interval: "year" };
    },
    async verifyWebhook(raw, signature) {
      if (signature !== "ok") throw new Error("ongeldig");
      return JSON.parse(raw);
    },
  };
  return {
    provider,
    subs,
    calls,
    failOnce: () => void (failNext = true),
    hold() {
      let release!: () => void;
      const wait = new Promise<void>((r) => (release = r));
      gate = { release, wait };
      return release;
    },
  };
}

/** Via de gedeelde testdatabase: in CI echte PostgreSQL, zodat de lock per abonnement echt wordt getest. */
async function setupBilling(billing: BillingProvider | null, withConfig = true) {
  const { db, app } = await setup({ billing, env: withConfig ? STRIPE_ENV : {} });
  const webhook = (body: unknown, signature = "ok", path = "/v1/billing/webhook") =>
    app.request(path, { method: "POST", headers: { "stripe-signature": signature, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { db, app, webhook };
}

const sub = (id: string, customerId: string, status = "active", extra: Partial<SubscriptionState> = {}): SubscriptionState => ({
  id,
  customerId,
  status,
  currentPeriodEnd: new Date(Date.now() + 300 * 86_400_000),
  cancelAtPeriodEnd: false,
  priceIds: [PRICE],
  ...extra,
});

/** Gebruiker met een Stripe-klant (via checkout). */
async function customer(app: Awaited<ReturnType<typeof setupBilling>>["app"], name = "Anna") {
  const u = await registerUser(app, name);
  expect((await u.c.post("/v1/billing/checkout")).status).toBe(200);
  return u;
}

describe("abonnement: routes", () => {
  it("vraagt een sessie, en geeft 503 als betalen uit staat", async () => {
    const { app } = await setupBilling(null, false);
    expect((await app.request("/v1/billing")).status).toBe(401);
    const u = await registerUser(app, "Anna");
    expect((await u.c.get("/v1/billing")).body).toEqual({ enabled: false, premium: false, status: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, price: null });
    for (const p of ["/v1/billing/checkout", "/v1/billing/portal", "/v1/billing/sync"]) expect((await u.c.post(p)).status).toBe(503);
  });

  it("toont de prijs zoals Stripe die kent", async () => {
    const { app } = await setupBilling(fakeStripe().provider);
    const u = await registerUser(app, "Anna");
    expect((await u.c.get("/v1/billing")).body.price).toEqual({ amount: 3500, currency: "eur", interval: "year" });
  });

  it("maakt één Stripe-klant per gebruiker, ook bij gelijktijdige verzoeken", async () => {
    const f = fakeStripe();
    const { app, db } = await setupBilling(f.provider);
    const u = await registerUser(app, "Anna");
    const [a, b] = await Promise.all([u.c.post("/v1/billing/checkout"), u.c.post("/v1/billing/checkout")]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const rows = await db.query<{ stripe_customer_id: string }>("SELECT stripe_customer_id FROM billing_customers");
    expect(rows).toHaveLength(1);
    // Beide checkouts horen bij die ene klant, ook de "verliezer" van de race.
    expect(a.body.url.endsWith(rows[0]!.stripe_customer_id) && b.body.url.endsWith(rows[0]!.stripe_customer_id)).toBe(true);
  });

  it("premium alleen bij active/trialing, onze prijs en een lopende periode", async () => {
    const f = fakeStripe();
    const { app, webhook } = await setupBilling(f.provider);
    const anna = await customer(app);
    const set = async (status: string, extra: Partial<SubscriptionState> = {}, n = Math.random().toString(36).slice(2, 10)) => {
      f.subs.set("sub_anna123456", sub("sub_anna123456", "cus_test1abcdef", status, extra));
      expect((await webhook({ id: `evt_${n}`, type: "customer.subscription.updated", subscriptionId: "sub_anna123456" })).status).toBe(200);
      return (await anna.c.get("/v1/billing")).body;
    };
    expect(await set("active")).toMatchObject({ enabled: true, premium: true, status: "active" });
    expect((await set("trialing")).premium).toBe(true);
    for (const s of ["past_due", "canceled", "unpaid", "incomplete", "paused"]) expect((await set(s)).premium, s).toBe(false);
    expect((await set("active", { priceIds: ["price_anderproduct"] })).premium).toBe(false);
    expect((await set("active", { currentPeriodEnd: new Date(Date.now() - 4 * 86_400_000) })).premium).toBe(false);
    expect((await set("active", { currentPeriodEnd: new Date(Date.now() - 1 * 86_400_000) })).premium).toBe(true); // speling 3 dagen
  });

  it("geen tweede abonnement zolang er een loopt, ook als de webhook nog niet binnen is", async () => {
    const f = fakeStripe();
    const { app, webhook } = await setupBilling(f.provider);
    const anna = await customer(app);
    // Betaald, maar de webhook is er nog niet: de live controle bij Stripe vangt het.
    f.subs.set("sub_anna123456", sub("sub_anna123456", "cus_test1abcdef", "incomplete"));
    expect((await anna.c.post("/v1/billing/checkout")).body.error.code).toBe("subscription_exists");
    // Achterstallig (lokaal bekend): ook geen tweede abonnement.
    f.subs.set("sub_anna123456", sub("sub_anna123456", "cus_test1abcdef", "past_due"));
    await webhook({ id: "evt_pastdue123", type: "customer.subscription.updated", subscriptionId: "sub_anna123456" });
    expect((await anna.c.post("/v1/billing/checkout")).status).toBe(409);
    // Echt beëindigd: opnieuw afsluiten mag.
    f.subs.set("sub_anna123456", sub("sub_anna123456", "cus_test1abcdef", "canceled"));
    await webhook({ id: "evt_canceled12", type: "customer.subscription.deleted", subscriptionId: "sub_anna123456" });
    expect((await anna.c.post("/v1/billing/checkout")).status).toBe(200);
  });

  it("gebruikt nooit de inhoud van het event: een 'deleted'-event laat een actief abonnement actief", async () => {
    const f = fakeStripe();
    const { app, webhook } = await setupBilling(f.provider);
    const anna = await customer(app);
    f.subs.set("sub_anna123456", sub("sub_anna123456", "cus_test1abcdef"));
    await webhook({ id: "evt_vals123456", type: "customer.subscription.deleted", subscriptionId: "sub_anna123456" });
    expect((await anna.c.get("/v1/billing")).body.premium).toBe(true);
  });

  it("verwerkt een dubbel event maar één keer", async () => {
    const f = fakeStripe();
    const { app, webhook } = await setupBilling(f.provider);
    const anna = await customer(app);
    f.subs.set("sub_anna123456", sub("sub_anna123456", "cus_test1abcdef"));
    const evt = { id: "evt_dubbel1234", type: "customer.subscription.created", subscriptionId: "sub_anna123456" };
    expect((await webhook(evt)).status).toBe(200);
    const again = await webhook(evt);
    expect(again.status).toBe(200);
    expect(((await again.json()) as { duplicate?: boolean }).duplicate).toBe(true);
    expect(f.calls.retrieves).toBe(1);
    expect((await anna.c.get("/v1/billing")).body.premium).toBe(true);
  });

  it("race: een trage, oude opvraag overschrijft een nieuwere status niet", async () => {
    const f = fakeStripe();
    const { app, webhook } = await setupBilling(f.provider);
    const anna = await customer(app);
    f.subs.set("sub_anna123456", sub("sub_anna123456", "cus_test1abcdef", "incomplete"));
    const release = f.hold(); // de eerste opvraag leest "incomplete" en blijft hangen
    const slow = webhook({ id: "evt_traag12345", type: "customer.subscription.created", subscriptionId: "sub_anna123456" });
    await new Promise((r) => setTimeout(r, 20));
    f.subs.set("sub_anna123456", sub("sub_anna123456", "cus_test1abcdef", "active"));
    const fast = webhook({ id: "evt_snel123456", type: "checkout.session.completed", subscriptionId: "sub_anna123456" });
    await new Promise((r) => setTimeout(r, 20));
    release();
    expect((await slow).status).toBe(200);
    expect((await fast).status).toBe(200);
    expect((await anna.c.get("/v1/billing")).body).toMatchObject({ premium: true, status: "active" });
  });

  it("als Stripe onbereikbaar is, wordt het event niet als verwerkt opgeslagen (Stripe probeert opnieuw)", async () => {
    const f = fakeStripe();
    const { app, webhook } = await setupBilling(f.provider);
    const anna = await customer(app);
    f.subs.set("sub_anna123456", sub("sub_anna123456", "cus_test1abcdef"));
    f.failOnce();
    const evt = { id: "evt_retry12345", type: "customer.subscription.created", subscriptionId: "sub_anna123456" };
    expect((await webhook(evt)).status).toBe(500);
    expect((await webhook(evt)).status).toBe(200);
    expect((await anna.c.get("/v1/billing")).body.premium).toBe(true);
  });

  it("herstel na een gemiste webhook: 'status vernieuwen' haalt alles opnieuw op bij Stripe", async () => {
    const f = fakeStripe();
    const { app } = await setupBilling(f.provider);
    const anna = await customer(app);
    f.subs.set("sub_anna123456", sub("sub_anna123456", "cus_test1abcdef"));
    expect((await anna.c.get("/v1/billing")).body.premium).toBe(false);
    const s = await anna.c.post("/v1/billing/sync");
    expect(s.status).toBe(200);
    expect(s.body).toMatchObject({ premium: true, status: "active" });
  });

  it("negeert abonnementen van klanten die niet via KERN zijn aangemaakt", async () => {
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
    const anna = await customer(app, "Anna"); // cus_test1
    const bob = await customer(app, "Bob"); // cus_test2
    f.subs.set("sub_anna123456", sub("sub_anna123456", "cus_test1abcdef"));
    await webhook({ id: "evt_eerst12345", type: "customer.subscription.created", subscriptionId: "sub_anna123456" });
    f.subs.set("sub_anna123456", sub("sub_anna123456", "cus_test2abcdef"));
    await webhook({ id: "evt_daarna1234", type: "customer.subscription.updated", subscriptionId: "sub_anna123456" });
    expect((await bob.c.get("/v1/billing")).body.premium).toBe(false);
    expect((await anna.c.get("/v1/billing")).body.premium).toBe(true);
  });

  it("weigert een webhook zonder geldige handtekening; alleen exact het webhookpad mag zonder Origin", async () => {
    const f = fakeStripe();
    const { app, webhook } = await setupBilling(f.provider);
    expect((await webhook({ id: "evt_x12345678", type: "x" }, "fout")).status).toBe(400);
    expect((await webhook({ id: "evt_x12345678", type: "x" }, "")).status).toBe(400);
    expect((await webhook({ id: "geen-evt", type: "x" })).status).toBe(400);
    expect((await webhook({ id: "evt_ok12345678", type: "invoice.paid" })).status).toBe(200);
    // Varianten van het pad vallen niet onder de uitzondering.
    for (const p of ["/v1/billing/webhook/", "/v1/billing/Webhook"]) expect((await webhook({ id: "evt_p12345678", type: "x" }, "ok", p)).status, p).toBe(403);
    const anna = await registerUser(app, "Anna");
    const noOrigin = await app.request("/v1/billing/checkout", { method: "POST", headers: { cookie: anna.c.cookie } });
    expect(noOrigin.status).toBe(403);
  });

  it("de webhook heeft een eigen rate-limit-bucket (vertraagt de API niet en wordt er niet door vertraagd)", async () => {
    const f = fakeStripe();
    const { app, webhook } = await setupBilling(f.provider);
    const anna = await registerUser(app, "Anna");
    for (let i = 0; i < 130; i++) expect((await webhook({ id: "evt_x12345678", type: "x" }, "fout")).status).toBe(400);
    expect((await anna.c.get("/v1/billing")).status).toBe(200);
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
