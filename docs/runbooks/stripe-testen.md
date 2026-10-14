# Runbook: het Box 3-abonnement testen (Stripe-testmodus)

Zonder Stripe-variabelen staat betalen uit en toont de rekenhulp "komt binnenkort beschikbaar". Zo test je het lokaal, **zonder echt geld**.

## 1. Stripe in testmodus

1. Maak een Stripe-account. Zet in het dashboard de schakelaar op **Testmodus**.
2. **Product** → "KERN Box 3-rapport", prijs **€35 per jaar**, terugkerend. Kopieer het `price_…`-ID.
3. **Developers → API keys → Restricted key** met alleen:
   - Customers: schrijven
   - Checkout Sessions: schrijven
   - Customer portal: schrijven
   - Subscriptions: lezen

   Kopieer de `rk_test_…`-sleutel.
4. **Settings → Billing → Customer portal**: zet opzeggen aan (aan het einde van de periode) en het bijwerken van de betaalmethode.
5. Installeer de Stripe CLI en log in:
   ```bash
   stripe login
   ```

## 2. Lokaal draaien

Zet de waarden in je shell, nooit in de repo (push protection blokkeert ze ook):

```bash
stripe listen --forward-to localhost:8787/v1/billing/webhook
```

Neem het `whsec_…`-geheim dat `stripe listen` toont, en start de API in een tweede terminal:

```bash
STRIPE_SECRET_KEY=rk_test_... STRIPE_WEBHOOK_SECRET=whsec_... STRIPE_PRICE_ID=price_... npm run dev:api
```

```bash
npm run dev
```

## 3. Testen

1. Log in (runbook `testen.md` §2) en ga naar **Box 3**. Bereken iets; onder de uitkomst staat **Rapport voor je aangifte**.
2. **Abonneren via Stripe** → betaal met testkaart `4242 4242 4242 4242` (elke toekomstige datum, elke CVC), of met iDEAL in testmodus.
3. Je komt terug in KERN; na hooguit een paar seconden (webhook) verschijnt **Rapport downloaden (CSV)**. Open het in Excel of Numbers.
4. **Abonnement beheren** → zeg op in het portaal. Het rapport blijft beschikbaar tot de einddatum.
5. Ook testen:
   - testkaart `4000 0000 0000 0341` (betaling faalt later): status `past_due`, geen rapport;
   - `stripe trigger customer.subscription.deleted`.

## Terugbetalen (herroepingsrecht)

Vraagt iemand binnen 14 dagen zijn geld terug: Stripe-dashboard → Payments → de betaling → **Refund**. Zeg het abonnement daarna direct op in het dashboard.

## Productie

Pas na control **CONS-3** (juridische toets) en met `rk_live_…` (de API weigert een testsleutel in productie). Zet het webhook-endpoint `https://<api-domein>/v1/billing/webhook` in het Stripe-dashboard op de events `checkout.session.completed` en `customer.subscription.*`. Bewaar de secrets alleen in de secret manager van de hosting.
