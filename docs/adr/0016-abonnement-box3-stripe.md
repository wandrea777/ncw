# ADR-0016: Abonnement op het Box 3-rapport via Stripe

- **Status:** Aangenomen (techniek) · juridische toets vóór activeren (⚖️, CONS-2 en CONS-3) · 2026-10-14
- **Context:** de eigenaar wil een "Stripe-abonnement voor Box 3" en koos "Stripe, €35/jaar" en "Rekenhulp gratis, rapport betaald". PLAN.md §3 noemt premium "Belasting" als groen verdienmodel #2: pure software, geen transactie, geen MiCA.

## Besluit

| Onderdeel | Keuze | Waarom |
|---|---|---|
| Wat is betaald | Het **aangifterapport** (CSV met de waarden per peildatum, het overige vermogen, de uitkomst en alle transacties in euro's). De rekenhulp en "Afdrukken als PDF" blijven gratis. | Er verdwijnt niets wat al gratis was; de gratis rekenhulp blijft de instap. |
| Betalen | **Stripe Checkout** (gehoste pagina), `mode: subscription`, één prijs (`STRIPE_PRICE_ID`) | Stripe doet betaling, iDEAL/kaart, facturen en btw-administratie. KERN ziet geen betaalgegevens en hoeft geen PCI-scope te dragen. |
| Beheren | **Stripe-klantportaal** (opzeggen, betaalmethode, facturen) | Opzeggen moet even makkelijk zijn als afsluiten (Wet "klik om op te zeggen"). |
| Status | **Webhook** met handtekening; de status wordt bij elk event **vers opgehaald** bij Stripe | Volgorde en herhaling van events maken dan niet uit. Gebruikt nooit de inhoud van het event. |
| Koppeling aan een gebruiker | Alleen via onze eigen tabel `billing_customers` (gebruiker ↔ `cus_…`), nooit via metadata | Een abonnement van een klant die niet via KERN is gemaakt, of metadata die iemand aanpast, kan niemand premium maken. |
| Opslag | `billing_customers`, `subscriptions` (status, einddatum periode), `stripe_events` (idempotentie). **Geen** e-mail, naam, adres of betaalgegevens. | Data-minimalisatie (AVG art. 5). Stripe vraagt zelf om het e-mailadres. |
| Rapport maken | In de browser (`box3ReportCsv` in `@ncw/core`) | Zero-knowledge: adressen en bedragen gaan niet naar de server. |
| Afdwingen | Alleen in de UI | De berekening draait lokaal en de code is open source; wie wil, kan het rapport zelf maken. Dat is bewust: het abonnement betaalt voor gemak en onderhoud, niet voor geheimhouding. Server-side afdwingen zou adressen naar de server sturen. |

## Beveiliging (allemaal getest in `apps/api/test/billing.test.ts` en `apps/web/test/billing.test.ts`)

1. **Configuratie faalt dicht:** alle drie de variabelen samen of geen. Een live sleutel (`sk_live_`/`rk_live_`) buiten productie of een testsleutel in productie start niet, en onbekende formaten (bijv. een publishable key) worden geweigerd. Aanbevolen is een **restricted key** (`rk_`) met alleen: Customers schrijven, Checkout Sessions schrijven, Customer portal schrijven, Subscriptions lezen.
2. **Webhook:** de handtekening wordt gecontroleerd met de officiële SDK (`constructEventAsync`, HMAC-SHA256, tolerantie 300 s tegen replay). Dat is getest met echte, door de SDK gemaakte handtekeningen: geldig, gewijzigde body, ander geheim, oude tijdstempel en ontbrekende header.
3. **CSRF:** alleen exact `POST /v1/billing/webhook` mag zonder `Origin`. Alle andere wijzigende verzoeken blijven de origincontrole houden.
4. **Idempotentie:** een event wordt één keer verwerkt (`stripe_events`, in dezelfde transactie als de statuswijziging).
5. **Premium** alleen bij `active` of `trialing` (niet bij `past_due`, `unpaid`, `canceled`, `paused` of `incomplete`).
6. **Doorsturen** gaat alleen naar `https://checkout.stripe.com` en `https://billing.stripe.com` (exacte host, geen poort of userinfo). Een gecompromitteerde API kan niet naar een nagemaakte betaalpagina sturen.
7. Afrekenen kan niet twee keer bij een geldig abonnement (409). Eén Stripe-klant per gebruiker, ook bij gelijktijdige verzoeken (unieke sleutel plus idempotency key bij Stripe).

## Juridisch (⚖️, vóór activeren)

- **Herroepingsrecht (14 dagen):** het rapport is digitale inhoud. Zonder uitdrukkelijke afstand heeft de consument 14 dagen bedenktijd. Het voorstel in de voorwaarden is eenvoudig en eerlijk: binnen 14 dagen opzeggen geeft geld terug (handmatig via het Stripe-dashboard).
- **Stilzwijgende verlenging (art. 7:236 BW):** na het eerste jaar mag een consumentenabonnement alleen voor onbepaalde tijd doorlopen, met maandelijkse opzegging. Jaarlijks automatisch €35 afschrijven zonder dat de consument per maand kan opzeggen, mag dus niet. Opties: (a) na het eerste jaar pro rata terugbetalen bij opzegging, (b) geen automatische verlenging (`cancel_at_period_end` na het eerste jaar), of (c) een maandprijs. **De jurist kiest**; tot die tijd blijft betalen uit (geen Stripe-variabelen in productie).
- **Btw/KOR en KvK:** de prijs voor consumenten moet het totaalbedrag zijn. Of er btw op komt, hangt af van de KOR (kleineondernemersregeling); dat beslist de eigenaar met de Belastingdienst.
- **Geen MiCA, geen Wwft:** het abonnement is software, niet verbonden aan transacties (PLAN.md §3, groen model #2).

## Nieuwe dependency

| Pakket | Licentie | Waarom |
|---|---|---|
| `stripe` 22.6.2 | MIT | De officiële SDK, **zonder dependencies**. Nodig voor de handtekeningcontrole van webhooks (geen eigen cryptografie) en de API-aanroepen. Versie 23.0.0 was op 14-10 pas 13 dagen oud en een nieuwe major; Dependabot stelt die voor als hij bewezen is. Telemetrie uit (`telemetry: false`). |

## Alternatieven

- **Mollie:** een Nederlandse partij met iDEAL/Wero standaard, en EU-only past bij ADR-0007. Toch niet gekozen, omdat de eigenaar Stripe koos. Het wisselen is beperkt tot `billing/provider.ts`.
- **Payment Links zonder server:** dan is er geen koppeling met het account en geen status, zodat iedereen het rapport zou krijgen.
