# QA: Abonnement op het Box 3-aangifterapport (Stripe)

- **Datum:** 2026-10-14 · **Branch:** `box3-abonnement` · gereviewd: commit `d4dcb1c`
- **Reviewers (onafhankelijk):** qa-reviewer, security-reviewer
- **Opdracht van de eigenaar (letterlijk):** *"Stripe-abonnement voor Box 3 bouwen."* Keuzes: *"Stripe, €35/jaar (Aanbevolen)"* en *"Rekenhulp gratis, rapport betaald (Aanbevolen)"*. Bij die laatste keuze stond: "Premium = een downloadbaar Box 3-overzicht per peildatum (CSV + printbare pagina) voor je aangifte, voor meerdere jaren."

## Bevindingen → besluit → fix

| # | Bron | Ernst | Bevinding | Besluit | Fix / reden |
|---|---|---|---|---|---|
| 1 | QA, Security | Hoog / middel | Dubbel abonnement mogelijk: bij `past_due`/`unpaid`/`paused`, bij een vertraagde webhook na betalen, en met twee tabbladen | Opgelost (restrisico bij twee tabbladen) | Checkout weigert (409 `subscription_exists`) bij elk niet-beëindigd abonnement, lokaal én live bij Stripe (`subscriptions.list`). De UI biedt dan "Abonnement beheren" aan. Sessies verlopen na 30 minuten. Het runbook zet *Limit customers to one subscription* aan. Getest. |
| 2 | QA, Security | Middel | Race: de status werd buiten de transactie opgehaald, waarna de laatste schrijver won en een verouderde status kon blijven staan | Opgelost | Ophalen en opslaan onder `pg_advisory_xact_lock` per abonnement, in dezelfde transactie als de idempotentie. Getest op **echte PostgreSQL**: zonder lock faalt de racetest, met lock slaagt hij. De billing-tests gebruiken nu de gedeelde testdatabase, en die is in CI PostgreSQL. |
| 3 | Security | Middel | Geen herstel na een gemiste webhook; "Status vernieuwen" las alleen de database | Opgelost | `POST /v1/billing/sync` haalt alle abonnementen van de klant opnieuw op. Gebruikt door "Status vernieuwen" en automatisch na terugkeer van Stripe (30 s lang opnieuw proberen). Getest. |
| 4 | QA | Hoog | De printbare pagina uit de opdracht ontbrak | Opgelost | "Rapport afdrukken of als PDF" (betaald): een printweergave met dezelfde inhoud als de CSV, uit één bron (`box3Report`). De bestaande gratis afdrukknop van de rekenhulp blijft. |
| 5 | QA | Middel | Het CSV miste waarschuwingen, eindkoers en crypto-totaal; ETH werd afgerond op 8 decimalen | Opgelost | Waarschuwingsregels (per munt, lopend jaar, ongeverifieerde tarieven), "Koers 1 januari Y+1", "Crypto totaal", hoeveelheden met de decimalen van de munt (ETH 18). Tests voor meerdere munten, indicatief, interne overboeking, opbrengst en gas-bedragen. |
| 6 | QA | Middel | Na terugkeer van Stripe stond je op het overzicht; het focus-event werkt niet na een volledige paginalading | Opgelost | `returnUrl` is `?abonnement=terug#/wallet`. Het dashboard opent dan het Box 3-tabblad, haalt de parameter weg, synchroniseert en pollt. Een melding legt uit dat je opnieuw moet rekenen. |
| 7 | Security | Laag | Premium hing niet af van de prijs of de periode | Opgelost | Premium alleen met `price_ok` (onze `STRIPE_PRICE_ID`) en `current_period_end > now() - 3 dagen`. Getest. |
| 8 | Security | Laag | Volledige `sk_live_` toegestaan in productie | Opgelost | In productie alleen `rk_live_`. Getest. |
| 9 | Security, QA | Laag | Gebruikers-ID als metadata/`client_reference_id` naar Stripe, niet in de privacyverklaring; doorgifte naar de VS niet genoemd | Opgelost | Er gaat geen ID meer naar Stripe (lege klant; de koppeling staat alleen in onze tabel). De privacyverklaring noemt Stripe Inc. (VS). De rol van Stripe wordt getoetst onder AVG-3. |
| 10 | Security | Laag | De copy beloofde geld terug bij opzeggen in het portaal en "opzeggen kan altijd" | Opgelost | Voorwaarden en UI: herroepen per e-mail met het modelformulier geeft geld terug; het portaal stopt alleen de verlenging aan het einde van de periode. |
| 11 | Security, QA | Laag | Account verwijderen stopt de betaling niet (`ON DELETE CASCADE`) | Gedocumenteerd | Er is nog geen verwijder-endpoint. Het runbook en ADR-0016 zeggen dat je eerst bij Stripe opzegt en daarna het account verwijdert. Bij het bouwen van het endpoint moet dat automatisch gebeuren. |
| 12 | Security | Info | De webhook deelde de rate-limit-bucket met de API | Opgelost | Eigen bucket (`stripe-webhook`). Getest (130 foute webhooks hinderen de API niet). |
| 13 | QA | Laag | `stripe_events` groeide zonder grens; ook irrelevante events | Opgelost | 30 dagen bewaard (index op `processed_at`). Stripe probeert hooguit 3 dagen opnieuw. |
| 14 | QA | Laag | Het panel flitste en deed een nieuwe GET bij elke herberekening; `busy` bleef hangen na terug via bfcache | Opgelost | Status één keer opgehaald in `useBilling`; `pageshow` zet `busy` terug. |
| 15 | QA | Laag | €35 stond vast in de UI | Opgelost | De prijs komt van Stripe (`prices.retrieve`, 1 uur gecachet) en wordt in de UI geformatteerd. |
| 16 | QA | Laag | Tests: tautologie (URL-gelijkheid), zwakke assertie (`[403, 404]`), geen test voor gelijktijdigheid, geen test voor een fout bij het ophalen | Opgelost | Gelijktijdige checkout met één klant, exact 403 voor padvarianten, een 500 bij een onbereikbare Stripe zonder het event als verwerkt op te slaan, event-inhoud genegeerd, checkout-sessie in de handtekeningtest. |
| 17 | QA | Laag | Threat model en docs-index niet bijgewerkt | Opgelost | Drie nieuwe rijen in het threat model; het runbook staat in `docs/README.md`. |
| 18 | QA | Info | De rekenhulp staat alleen achter een (gratis) account | Geaccepteerd | Een account is gratis en zonder wachtwoord (passkey). Een openbare rekenhulp kan later. |
| 19 | QA | Info | ReportPanel heeft geen componenttest | Open | Er is nog geen DOM-testomgeving. De pure delen (`billingReturn`, `formatPrice`, `isStripeRedirect`, `box3Report`) zijn getest, en de flow is in de browser gecontroleerd. |

## Verificatie na de fixes
- `npm test` (core, web, api op PGlite **en** op echte PostgreSQL), `npm run typecheck`, `npm run compliance` en `npm run docs-check`: alle groen.
- In de browser (dev-server met een nep-sessie en een nep-abonnement): niet-premium met de prijs van Stripe, terugkeer met `?abonnement=terug` (Box 3-tabblad, parameter weg), premium met CSV-download en printweergave.
