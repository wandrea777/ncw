import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Deps } from "../app.ts";
import type { AppEnv } from "../auth/session.ts";
import { requireSession } from "../auth/session.ts";
import { SUBSCRIPTION_EVENTS, type BillingProvider, type SubscriptionState } from "../billing/provider.ts";
import { ApiError, isUniqueViolation } from "../lib/errors.ts";
import { errorResponses, json } from "../lib/schemas.ts";
import type { Db } from "../db/db.ts";

/** Statussen waarbij het rapport beschikbaar is. `past_due` niet: Stripe probeert dan nog te innen. */
export const PREMIUM_STATUSES = new Set(["active", "trialing"]);
/** Statussen waarna het abonnement echt voorbij is. Bij alle andere kan er niet nog eens worden afgesloten. */
const ENDED = new Set(["canceled", "incomplete_expired"]);
const STATUSES = new Set(["incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"]);
/** Speling na het einde van de periode (verlenging en webhook kunnen iets later komen). */
const GRACE = "3 days";
const EVENT_RETENTION = "30 days"; // Stripe probeert hooguit 3 dagen opnieuw

export const WEBHOOK_PATH = "/v1/billing/webhook";

const Billing = z
  .object({
    enabled: z.boolean(),
    premium: z.boolean(),
    status: z.string().nullable(),
    currentPeriodEnd: z.string().nullable(),
    cancelAtPeriodEnd: z.boolean(),
    price: z.object({ amount: z.number(), currency: z.string(), interval: z.string() }).nullable(),
  })
  .openapi("Billing");
const RedirectUrl = z.object({ url: z.url() }).openapi("RedirectUrl");

const disabled = () => new ApiError(503, "billing_disabled", "Betalen staat nog niet aan.");

async function customerOf(db: Db, userId: string) {
  return (await db.query<{ stripe_customer_id: string }>("SELECT stripe_customer_id FROM billing_customers WHERE user_id = $1", [userId]))[0]
    ?.stripe_customer_id;
}

/**
 * Het abonnement dat telt: een geldig abonnement gaat voor, anders het laatst bijgewerkte. Premium alleen bij een
 * geldige status, onze prijs én een periode die niet (ruim) voorbij is; een gemist "deleted"-event geeft zo geen
 * eeuwige toegang.
 */
export async function billingStatus(db: Db, userId: string) {
  const row = (
    await db.query<{ status: string; current_period_end: Date | null; cancel_at_period_end: boolean; premium: boolean }>(
      `SELECT status, current_period_end, cancel_at_period_end,
              (status IN ('active', 'trialing') AND price_ok AND current_period_end > now() - interval '${GRACE}') AS premium
       FROM subscriptions WHERE user_id = $1
       ORDER BY 4 DESC, (status NOT IN ('canceled', 'incomplete_expired')) DESC, updated_at DESC LIMIT 1`,
      [userId],
    )
  )[0];
  return {
    premium: row?.premium === true,
    status: row?.status ?? null,
    currentPeriodEnd: row?.current_period_end ? new Date(row.current_period_end).toISOString() : null,
    cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
  };
}

/** Slaat de verse status van Stripe op, gekoppeld aan de gebruiker via onze eigen klanttabel (nooit via metadata). */
async function storeSubscription(db: Db, sub: SubscriptionState, priceId: string): Promise<boolean> {
  if (!/^sub_[A-Za-z0-9]{6,64}$/.test(sub.id) || !STATUSES.has(sub.status)) throw new Error("Onverwacht abonnement van Stripe");
  const owner = (await db.query<{ user_id: string }>("SELECT user_id FROM billing_customers WHERE stripe_customer_id = $1", [sub.customerId]))[0];
  if (!owner) return false; // klant die niet via KERN is aangemaakt: negeren
  await db.query(
    `INSERT INTO subscriptions (stripe_subscription_id, user_id, status, current_period_end, cancel_at_period_end, price_ok, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (stripe_subscription_id) DO UPDATE
       SET status = EXCLUDED.status, current_period_end = EXCLUDED.current_period_end,
           cancel_at_period_end = EXCLUDED.cancel_at_period_end, price_ok = EXCLUDED.price_ok, updated_at = now()
     WHERE subscriptions.user_id = EXCLUDED.user_id`,
    [sub.id, owner.user_id, sub.status, sub.currentPeriodEnd, sub.cancelAtPeriodEnd, sub.priceIds.includes(priceId)],
  );
  return true;
}

/**
 * Haalt een abonnement op en slaat het op onder een lock per abonnement. Zo kan een trage, oude opvraag een nieuwere
 * status niet meer overschrijven: wie de lock heeft, haalt pas dan de actuele status op.
 */
async function syncSubscription(tx: Db, billing: BillingProvider, subscriptionId: string, priceId: string) {
  await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [subscriptionId]);
  await storeSubscription(tx, await billing.getSubscription(subscriptionId), priceId);
}

export function registerBillingRoutes(app: OpenAPIHono<AppEnv>, { db, cfg, billing }: Deps & { billing: BillingProvider | null }) {
  // Terug van Stripe: de web-app opent dan het belastingtabblad en haalt de status op (zie Tool.tsx).
  const returnUrl = `${cfg.origin}/?abonnement=terug#/wallet`;
  const priceId = cfg.stripe?.priceId ?? "";
  for (const p of ["/v1/billing", "/v1/billing/checkout", "/v1/billing/portal", "/v1/billing/sync"]) app.use(p, requireSession(db, cfg));

  app.openapi(
    createRoute({ method: "get", path: "/v1/billing", tags: ["billing"], responses: { 200: json(Billing), ...errorResponses } }),
    async (c) => {
      // De prijs komt van Stripe zelf, zodat de UI nooit een ander bedrag noemt dan er wordt afgeschreven.
      const price = billing ? await billing.getPrice().catch(() => null) : null;
      return c.json({ enabled: !!billing, ...(await billingStatus(db, c.get("user").userId)), price }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/billing/checkout",
      tags: ["billing"],
      description: "Start Stripe Checkout voor het Box 3-abonnement. De gebruiker betaalt bij Stripe; KERN ziet geen betaalgegevens.",
      responses: { 200: json(RedirectUrl), ...errorResponses, 503: { ...errorResponses[409], description: "Betalen staat uit" } },
    }),
    async (c) => {
      if (!billing) throw disabled();
      const { userId } = c.get("user");
      let customerId = await customerOf(db, userId);
      // Geen tweede abonnement zolang er een loopt (ook past_due, unpaid, paused of een betaling in behandeling).
      // Eerst lokaal, daarna live bij Stripe: de webhook kan nog onderweg zijn.
      const exists = () => new ApiError(409, "subscription_exists", "Je hebt al een abonnement of een betaling in behandeling.");
      const local = await db.query("SELECT 1 FROM subscriptions WHERE user_id = $1 AND status NOT IN ('canceled', 'incomplete_expired')", [userId]);
      if (local.length) throw exists();
      if (customerId && (await billing.listSubscriptions(customerId)).some((s) => !ENDED.has(s.status))) throw exists();
      if (!customerId) {
        const created = await billing.createCustomer();
        try {
          await db.query("INSERT INTO billing_customers (user_id, stripe_customer_id) VALUES ($1, $2)", [userId, created]);
          customerId = created;
        } catch (e) {
          // Twee gelijktijdige verzoeken: de ander was eerder. De extra (lege) Stripe-klant heeft geen abonnement.
          if (!isUniqueViolation(e)) throw e;
          customerId = (await customerOf(db, userId))!;
        }
      }
      return c.json({ url: await billing.createCheckout({ customerId, returnUrl }) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/billing/sync",
      tags: ["billing"],
      description: "Haalt de abonnementen van de gebruiker opnieuw op bij Stripe (herstel na een gemiste of vertraagde webhook).",
      responses: { 200: json(Billing), ...errorResponses, 503: { ...errorResponses[409], description: "Betalen staat uit" } },
    }),
    async (c) => {
      if (!billing) throw disabled();
      const { userId } = c.get("user");
      const customerId = await customerOf(db, userId);
      if (customerId) {
        for (const s of await billing.listSubscriptions(customerId)) {
          await db.transaction((tx) => syncSubscription(tx, billing, s.id, priceId));
        }
      }
      const price = await billing.getPrice().catch(() => null);
      return c.json({ enabled: true, ...(await billingStatus(db, userId)), price }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/billing/portal",
      tags: ["billing"],
      description: "Opent het klantportaal van Stripe (opzeggen, betaalmethode, facturen).",
      responses: { 200: json(RedirectUrl), ...errorResponses },
    }),
    async (c) => {
      if (!billing) throw disabled();
      const customerId = await customerOf(db, c.get("user").userId);
      if (!customerId) throw new ApiError(404, "no_customer", "Er is nog geen abonnement.");
      return c.json({ url: await billing.createPortal({ customerId, returnUrl }) }, 200);
    },
  );

  // Geen sessie en geen origincontrole: Stripe roept dit aan. De handtekening (HMAC met het webhookgeheim en een
  // tijdstempel) is de authenticatie. We gebruiken alleen het abonnement-ID uit het event en halen de actuele status
  // zelf op, onder een lock per abonnement (syncSubscription); volgorde, herhaling en gelijktijdigheid maken zo niet uit.
  app.post(WEBHOOK_PATH, async (c) => {
    if (!billing) throw disabled();
    const raw = await c.req.text();
    let evt;
    try {
      evt = await billing.verifyWebhook(raw, c.req.header("stripe-signature"));
    } catch {
      throw new ApiError(400, "bad_signature", "Ongeldige handtekening.");
    }
    if (!/^evt_[A-Za-z0-9]{6,64}$/.test(evt.id)) throw new ApiError(400, "bad_event", "Onbekend event.");
    const relevant = SUBSCRIPTION_EVENTS.has(evt.type) && evt.subscriptionId;
    const duplicate = await db.transaction(async (tx) => {
      const fresh = await tx.query("INSERT INTO stripe_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING id", [evt.id, evt.type.slice(0, 100)]);
      if (!fresh.length) return true;
      // Faalt het ophalen bij Stripe, dan rolt alles terug (ook het event) en probeert Stripe het later opnieuw.
      if (relevant) await syncSubscription(tx, billing, evt.subscriptionId!, priceId);
      return false;
    });
    if (Math.random() < 0.05) await db.query(`DELETE FROM stripe_events WHERE processed_at < now() - interval '${EVENT_RETENTION}'`);
    return c.json(duplicate ? { received: true, duplicate: true } : { received: true }, 200);
  });
}
