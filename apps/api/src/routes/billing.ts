import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Deps } from "../app.ts";
import type { AppEnv } from "../auth/session.ts";
import { requireSession } from "../auth/session.ts";
import { SUBSCRIPTION_EVENTS, type BillingProvider, type SubscriptionState } from "../billing/provider.ts";
import { ApiError, isUniqueViolation } from "../lib/errors.ts";
import { errorResponses, json } from "../lib/schemas.ts";
import type { Db } from "../db/db.ts";

/** Statussen waarbij het Box 3-rapport beschikbaar is. `past_due` niet: Stripe probeert dan nog te innen. */
export const PREMIUM_STATUSES = new Set(["active", "trialing"]);
const STATUSES = new Set(["incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"]);

export const WEBHOOK_PATH = "/v1/billing/webhook";

const Billing = z
  .object({
    enabled: z.boolean(),
    premium: z.boolean(),
    status: z.string().nullable(),
    currentPeriodEnd: z.string().nullable(),
    cancelAtPeriodEnd: z.boolean(),
  })
  .openapi("Billing");
const RedirectUrl = z.object({ url: z.url() }).openapi("RedirectUrl");

const disabled = () => new ApiError(503, "billing_disabled", "Betalen staat nog niet aan.");

async function customerOf(db: Db, userId: string) {
  return (await db.query<{ stripe_customer_id: string }>("SELECT stripe_customer_id FROM billing_customers WHERE user_id = $1", [userId]))[0]
    ?.stripe_customer_id;
}

/** Het abonnement dat telt: een geldig abonnement gaat voor, anders het laatst bijgewerkte. */
export async function billingStatus(db: Db, userId: string) {
  const row = (
    await db.query<{ status: string; current_period_end: Date | null; cancel_at_period_end: boolean }>(
      `SELECT status, current_period_end, cancel_at_period_end FROM subscriptions WHERE user_id = $1
       ORDER BY (status IN ('active', 'trialing')) DESC, updated_at DESC LIMIT 1`,
      [userId],
    )
  )[0];
  return {
    premium: !!row && PREMIUM_STATUSES.has(row.status),
    status: row?.status ?? null,
    currentPeriodEnd: row?.current_period_end ? new Date(row.current_period_end).toISOString() : null,
    cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
  };
}

/** Slaat de verse status van Stripe op, gekoppeld aan de gebruiker via onze eigen klanttabel (nooit via metadata). */
async function storeSubscription(db: Db, sub: SubscriptionState): Promise<boolean> {
  if (!/^sub_[A-Za-z0-9]{6,64}$/.test(sub.id) || !STATUSES.has(sub.status)) throw new Error("Onverwacht abonnement van Stripe");
  const owner = (await db.query<{ user_id: string }>("SELECT user_id FROM billing_customers WHERE stripe_customer_id = $1", [sub.customerId]))[0];
  if (!owner) return false; // klant die niet via KERN is aangemaakt: negeren
  await db.query(
    `INSERT INTO subscriptions (stripe_subscription_id, user_id, status, current_period_end, cancel_at_period_end, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (stripe_subscription_id) DO UPDATE
       SET status = EXCLUDED.status, current_period_end = EXCLUDED.current_period_end,
           cancel_at_period_end = EXCLUDED.cancel_at_period_end, updated_at = now()
     WHERE subscriptions.user_id = EXCLUDED.user_id`,
    [sub.id, owner.user_id, sub.status, sub.currentPeriodEnd, sub.cancelAtPeriodEnd],
  );
  return true;
}

export function registerBillingRoutes(app: OpenAPIHono<AppEnv>, { db, cfg, billing }: Deps & { billing: BillingProvider | null }) {
  const returnUrl = `${cfg.origin}/#/wallet`;
  for (const p of ["/v1/billing", "/v1/billing/checkout", "/v1/billing/portal"]) app.use(p, requireSession(db, cfg));

  app.openapi(
    createRoute({ method: "get", path: "/v1/billing", tags: ["billing"], responses: { 200: json(Billing), ...errorResponses } }),
    async (c) => c.json({ enabled: !!billing, ...(await billingStatus(db, c.get("user").userId)) }, 200),
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
      if ((await billingStatus(db, userId)).premium) throw new ApiError(409, "already_subscribed", "Je hebt al een abonnement.");
      let customerId = await customerOf(db, userId);
      if (!customerId) {
        const created = await billing.createCustomer(userId);
        try {
          await db.query("INSERT INTO billing_customers (user_id, stripe_customer_id) VALUES ($1, $2)", [userId, created]);
          customerId = created;
        } catch (e) {
          // Twee gelijktijdige verzoeken: de ander was eerder. De idempotency key bij Stripe geeft dezelfde klant.
          if (!isUniqueViolation(e)) throw e;
          customerId = (await customerOf(db, userId))!;
        }
      }
      return c.json({ url: await billing.createCheckout({ customerId, userId, returnUrl }) }, 200);
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
  // tijdstempel) is de authenticatie. We gebruiken nooit de inhoud van het event, alleen het abonnement-ID, en halen
  // de actuele status zelf op bij Stripe; zo maakt de volgorde of herhaling van events niet uit.
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
    const seen = (await db.query("SELECT 1 FROM stripe_events WHERE id = $1", [evt.id])).length > 0;
    if (seen) return c.json({ received: true, duplicate: true }, 200);
    const sub = SUBSCRIPTION_EVENTS.has(evt.type) && evt.subscriptionId ? await billing.getSubscription(evt.subscriptionId) : null;
    await db.transaction(async (tx) => {
      const fresh = await tx.query("INSERT INTO stripe_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING id", [evt.id, evt.type.slice(0, 100)]);
      if (fresh.length && sub) await storeSubscription(tx, sub);
    });
    return c.json({ received: true }, 200);
  });
}
