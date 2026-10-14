-- Abonnement voor het Box 3-rapport via Stripe (ADR-0016). Data-minimalisatie: geen e-mail, naam, adres of
-- betaalgegevens; die staan alleen bij Stripe. Wij bewaren de Stripe-ID's en de status.

CREATE TABLE billing_customers (
  user_id             uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id  text NOT NULL UNIQUE CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9]{6,64}$'),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subscriptions (
  stripe_subscription_id  text PRIMARY KEY CHECK (stripe_subscription_id ~ '^sub_[A-Za-z0-9]{6,64}$'),
  user_id                 uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status                  text NOT NULL CHECK (status IN ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')),
  current_period_end      timestamptz,
  cancel_at_period_end    boolean NOT NULL DEFAULT false,
  -- Bevat het abonnement onze prijs (STRIPE_PRICE_ID)? Alleen dan premium; een ander of later product telt niet.
  price_ok                boolean NOT NULL,
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_user_idx ON subscriptions(user_id);

-- Verwerkte webhook-events: Stripe levert at-least-once; dubbele levering mag niets twee keer doen.
CREATE TABLE stripe_events (
  id            text PRIMARY KEY CHECK (id ~ '^evt_[A-Za-z0-9]{6,64}$'),
  type          text NOT NULL,
  processed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stripe_events_processed_idx ON stripe_events(processed_at);
