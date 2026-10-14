import Stripe from "stripe";
import type { StripeConfig } from "../config.ts";

/** De status van een abonnement zoals Stripe die nu kent (altijd vers opgehaald, nooit uit de webhook-payload). */
export interface SubscriptionState {
  id: string;
  customerId: string;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/** Een geverifieerd webhook-event: alleen wat we nodig hebben om de juiste abonnementen opnieuw op te halen. */
export interface VerifiedEvent {
  id: string;
  type: string;
  subscriptionId: string | null;
}

/**
 * Alles wat de API van de betaalpartij nodig heeft. In tests een nep-versie; in productie Stripe.
 * Er gaan geen persoonsgegevens van KERN naar Stripe behalve onze interne gebruikers-ID als metadata.
 */
export interface BillingProvider {
  createCustomer(userId: string): Promise<string>;
  createCheckout(args: { customerId: string; userId: string; returnUrl: string }): Promise<string>;
  createPortal(args: { customerId: string; returnUrl: string }): Promise<string>;
  getSubscription(id: string): Promise<SubscriptionState>;
  /** Gooit bij een ongeldige of verlopen handtekening. */
  verifyWebhook(rawBody: string, signature: string | undefined): Promise<VerifiedEvent>;
}

/** Webhook-events die iets aan een abonnement veranderen. */
export const SUBSCRIPTION_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

export function stripeProvider(cfg: StripeConfig): BillingProvider {
  // Geen eigen apiVersion: de SDK-versie pint de API-versie vast, zodat typen en gedrag bij elkaar passen.
  const stripe = new Stripe(cfg.secretKey, { maxNetworkRetries: 2, timeout: 20_000, telemetry: false });
  return {
    async createCustomer(userId) {
      const c = await stripe.customers.create({ metadata: { kern_user_id: userId } }, { idempotencyKey: `customer-${userId}` });
      return c.id;
    },
    async createCheckout({ customerId, userId, returnUrl }) {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        client_reference_id: userId,
        line_items: [{ price: cfg.priceId, quantity: 1 }],
        subscription_data: { metadata: { kern_user_id: userId } },
        success_url: returnUrl,
        cancel_url: returnUrl,
        locale: "auto",
        allow_promotion_codes: false,
      });
      if (!session.url) throw new Error("Stripe gaf geen checkout-URL terug");
      return session.url;
    },
    async createPortal({ customerId, returnUrl }) {
      const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
      return portal.url;
    },
    async getSubscription(id) {
      const s = await stripe.subscriptions.retrieve(id);
      // Sinds API-versie 2025-03-31 staat de periode per item; bij één item (één prijs) is dat de periode van het abonnement.
      const ends = s.items.data.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number");
      return {
        id: s.id,
        customerId: typeof s.customer === "string" ? s.customer : s.customer.id,
        status: s.status,
        currentPeriodEnd: ends.length ? new Date(Math.max(...ends) * 1000) : null,
        cancelAtPeriodEnd: s.cancel_at_period_end,
      };
    },
    async verifyWebhook(rawBody, signature) {
      if (!signature) throw new Error("Stripe-Signature ontbreekt");
      // Standaardtolerantie (300 s) tegen replay van oude, geldig ondertekende berichten.
      const evt = await stripe.webhooks.constructEventAsync(rawBody, signature, cfg.webhookSecret);
      return { id: evt.id, type: evt.type, subscriptionId: subscriptionIdOf(evt) };
    },
  };
}

function subscriptionIdOf(evt: Stripe.Event): string | null {
  const obj = evt.data.object as { object?: string; id?: string; subscription?: string | { id: string } | null };
  if (obj.object === "subscription" && typeof obj.id === "string") return obj.id;
  if (obj.object === "checkout.session") {
    const sub = obj.subscription;
    return typeof sub === "string" ? sub : (sub?.id ?? null);
  }
  return null;
}
