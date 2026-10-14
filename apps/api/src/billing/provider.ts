import Stripe from "stripe";
import type { StripeConfig } from "../config.ts";

/** De status van een abonnement zoals Stripe die nu kent (altijd vers opgehaald, nooit uit de webhook-payload). */
export interface SubscriptionState {
  id: string;
  customerId: string;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** De prijzen in het abonnement; premium alleen als onze prijs erin zit. */
  priceIds: string[];
}

/** Een geverifieerd webhook-event: alleen wat we nodig hebben om het juiste abonnement opnieuw op te halen. */
export interface VerifiedEvent {
  id: string;
  type: string;
  subscriptionId: string | null;
}

export interface PriceInfo {
  /** Bedrag in centen, inclusief eventuele btw zoals in Stripe ingesteld. */
  amount: number;
  currency: string;
  interval: string;
}

/**
 * Alles wat de API van de betaalpartij nodig heeft. In tests een nep-versie; in productie Stripe.
 * Er gaan geen gegevens van KERN naar Stripe: ook ons gebruikers-ID niet (de koppeling staat alleen in onze database).
 */
export interface BillingProvider {
  createCustomer(): Promise<string>;
  createCheckout(args: { customerId: string; returnUrl: string }): Promise<string>;
  createPortal(args: { customerId: string; returnUrl: string }): Promise<string>;
  getSubscription(id: string): Promise<SubscriptionState>;
  /** Alle abonnementen van een klant, ook beëindigde (voor de controle op dubbel afsluiten en voor herstel). */
  listSubscriptions(customerId: string): Promise<SubscriptionState[]>;
  getPrice(): Promise<PriceInfo>;
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

function toState(s: Stripe.Subscription): SubscriptionState {
  // Sinds API-versie 2025-03-31 staat de periode per item.
  const ends = s.items.data.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number");
  return {
    id: s.id,
    customerId: typeof s.customer === "string" ? s.customer : s.customer.id,
    status: s.status,
    currentPeriodEnd: ends.length ? new Date(Math.max(...ends) * 1000) : null,
    cancelAtPeriodEnd: s.cancel_at_period_end,
    priceIds: s.items.data.map((i) => i.price.id),
  };
}

export function stripeProvider(cfg: StripeConfig): BillingProvider {
  // Geen eigen apiVersion: de SDK-versie pint de API-versie vast, zodat typen en gedrag bij elkaar passen.
  const stripe = new Stripe(cfg.secretKey, { maxNetworkRetries: 2, timeout: 20_000, telemetry: false });
  let price: { at: number; info: PriceInfo } | null = null;
  return {
    async createCustomer() {
      return (await stripe.customers.create({})).id;
    },
    async createCheckout({ customerId, returnUrl }) {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: cfg.priceId, quantity: 1 }],
        success_url: returnUrl,
        cancel_url: returnUrl,
        locale: "auto",
        allow_promotion_codes: false,
        // Kort geldig: minder kans op twee openstaande sessies (twee tabbladen) die allebei worden betaald.
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      });
      if (!session.url) throw new Error("Stripe gaf geen checkout-URL terug");
      return session.url;
    },
    async createPortal({ customerId, returnUrl }) {
      return (await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl })).url;
    },
    async getSubscription(id) {
      return toState(await stripe.subscriptions.retrieve(id));
    },
    async listSubscriptions(customerId) {
      const list = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
      return list.data.map(toState);
    },
    async getPrice() {
      if (price && Date.now() - price.at < 3_600_000) return price.info;
      const p = await stripe.prices.retrieve(cfg.priceId);
      if (p.unit_amount === null || !p.recurring) throw new Error("STRIPE_PRICE_ID is geen terugkerende vaste prijs");
      price = { at: Date.now(), info: { amount: p.unit_amount, currency: p.currency, interval: p.recurring.interval } };
      return price.info;
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
