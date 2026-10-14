# ADR-0016: Abonnement op het Box 3-rapport via Stripe

- **Status:** Aangenomen (techniek) · juridische toets vóór activeren (⚖️, CONS-2 en CONS-3) · 2026-10-14
- **Context:** de eigenaar wil een "Stripe-abonnement voor Box 3" en koos "Stripe, €35/jaar" en "Rekenhulp gratis, rapport betaald". PLAN.md §3 noemt premium "Belasting" als groen verdienmodel #2: pure software, geen transactie, geen MiCA.

## Besluit

| Onderdeel | Keuze | Waarom |
|---|---|---|
| Wat is betaald | Het **aangifterapport**: per jaar een overzicht met de waarden per peildatum, de koersen, het overige vermogen, de uitkomst, de waarschuwingen en alle transacties in euro's. Als CSV en als printweergave (PDF via de browser), uit één bron (`box3Report`). De rekenhulp en "Afdrukken of opslaan als PDF" van de rekenhulp zelf blijven gratis. "Meerdere jaren" betekent: elk jaar opnieuw berekenen en downloaden; een overzicht van meerdere jaren in één keer is er (nog) niet. | Er verdwijnt niets wat al gratis was; de gratis rekenhulp (na een gratis account) blijft de instap. |
| Betalen | **Stripe Checkout** (gehoste pagina), `mode: subscription`, één prijs (`STRIPE_PRICE_ID`) | Stripe doet betaling, iDEAL/kaart, facturen en btw-administratie. KERN ziet geen betaalgegevens en hoeft geen PCI-scope te dragen. |
| Beheren | **Stripe-klantportaal** (opzeggen, betaalmethode, facturen) | Opzeggen moet even makkelijk zijn als afsluiten (Wet "klik om op te zeggen"). |
| Status | **Webhook** met handtekening; de status wordt bij elk event **vers opgehaald** bij Stripe, **onder een lock per abonnement** (`pg_advisory_xact_lock`) in dezelfde transactie als de idempotentie. Herstel via `POST /v1/billing/sync` (knop "Status vernieuwen" en automatisch na terugkeer van Stripe). | Volgorde, herhaling én gelijktijdigheid maken dan niet uit: wie de lock heeft, haalt pas dan de actuele status op. Getest op echte PostgreSQL (zonder lock faalt de test). |
| Koppeling aan een gebruiker | Alleen via onze eigen tabel `billing_customers` (gebruiker ↔ `cus_…`), nooit via metadata | Een abonnement van een klant die niet via KERN is gemaakt, of metadata die iemand aanpast, kan niemand premium maken. |
| Opslag | `billing_customers`, `subscriptions` (status, einddatum periode, `price_ok`), `stripe_events` (idempotentie, 30 dagen bewaard). **Geen** e-mail, naam, adres of betaalgegevens. Ook ons gebruikers-ID gaat **niet** naar Stripe (geen metadata, geen `client_reference_id`): we maken een lege Stripe-klant aan. | Data-minimalisatie (AVG art. 5). Stripe vraagt zelf om het e-mailadres. |
| Rapport maken | In de browser (`box3ReportCsv` in `@ncw/core`) | Zero-knowledge: adressen en bedragen gaan niet naar de server. |
| Afdwingen | Alleen in de UI | De berekening draait lokaal en de code is open source; wie wil, kan het rapport zelf maken. Dat is bewust: het abonnement betaalt voor gemak en onderhoud, niet voor geheimhouding. Server-side afdwingen zou adressen naar de server sturen. |

## Beveiliging (allemaal getest in `apps/api/test/billing.test.ts` en `apps/web/test/billing.test.ts`)

1. **Configuratie faalt dicht:** alle drie de variabelen samen of geen. Een live sleutel (`sk_live_`/`rk_live_`) buiten productie of een testsleutel in productie start niet, en onbekende formaten (bijv. een publishable key) worden geweigerd. Aanbevolen is een **restricted key** (`rk_`) met alleen: Customers schrijven, Checkout Sessions schrijven, Customer portal schrijven, Subscriptions lezen.
2. **Webhook:** de handtekening wordt gecontroleerd met de officiële SDK (`constructEventAsync`, HMAC-SHA256, tolerantie 300 s tegen replay). Dat is getest met echte, door de SDK gemaakte handtekeningen: geldig, gewijzigde body, ander geheim, oude tijdstempel en ontbrekende header.
3. **CSRF:** alleen exact `POST /v1/billing/webhook` mag zonder `Origin`. Alle andere wijzigende verzoeken blijven de origincontrole houden.
4. **Idempotentie:** een event wordt één keer verwerkt (`stripe_events`, in dezelfde transactie als de statuswijziging).
5. **Premium** alleen bij `active` of `trialing` (niet bij `past_due`, `unpaid`, `canceled`, `paused` of `incomplete`), én als het abonnement **onze prijs** (`STRIPE_PRICE_ID`) bevat, én als de periode niet meer dan 3 dagen voorbij is (een gemist `deleted`-event geeft zo geen eeuwige toegang). De prijs in de UI komt van Stripe zelf.
6. **Doorsturen** gaat alleen naar `https://checkout.stripe.com` en `https://billing.stripe.com` (exacte host, geen poort of userinfo). Een gecompromitteerde API kan niet naar een nagemaakte betaalpagina sturen.
7. **Geen dubbel abonnement:** afrekenen wordt geweigerd (409 `subscription_exists`, door naar het portaal) zolang er lokaal of live bij Stripe een niet-beëindigd abonnement is (ook `incomplete`, `past_due`, `unpaid`, `paused`). Zo kan een vertraagde webhook niet tot een tweede betaling leiden. Restrisico: twee checkout-sessies die tegelijk in twee tabbladen open staan; daarom verlopen sessies na 30 minuten en zet je in het Stripe-dashboard *Limit customers to one subscription* aan. Eén Stripe-klant per gebruiker, ook bij gelijktijdige verzoeken (unieke sleutel; een eventuele tweede lege klant heeft geen abonnement).
8. **Restricted key verplicht in productie** (`rk_live_`): een gelekte sleutel kan dan niet terugbetalen of uitbetalen.
9. De webhook heeft een **eigen rate-limit-bucket**, zodat verkeer achter hetzelfde (proxy-)IP hem niet kan vertragen.

## Juridisch (⚖️, vóór activeren)

- **Herroepingsrecht (14 dagen):** het rapport is digitale inhoud. Zonder uitdrukkelijke afstand heeft de consument 14 dagen bedenktijd. Het voorstel in de voorwaarden: herroepen per e-mail (met het modelformulier, art. 6:230m BW) geeft het volledige bedrag terug, handmatig via het Stripe-dashboard. Opzeggen in het portaal stopt alleen de verlenging; dat staat ook zo in de UI.
- **Account verwijderen:** bij een verwijderverzoek (AVG) **eerst** het abonnement bij Stripe opzeggen (en eventueel de klant verwijderen), dán het account. `ON DELETE CASCADE` verwijdert anders alleen de koppeling, en Stripe blijft innen zonder dat er een portaal bereikbaar is (runbook `stripe-testen.md`).
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
