# ADR-0013: Web-wallet: het v0-ontwerp gekoppeld aan API en rekenkern

- **Status:** Aangenomen · 2026-10-13
- **Context:** de eigenaar leverde een volledig ontwerp (`kern-wallet-development-test-ui`, Next.js/v0): landing en dashboard (overzicht, bezittingen, activiteit, beveiliging). Opdracht: "mijn backend en frontend aan elkaar laten sluiten en uitbreiden". De backend (`apps/api`) doet passkeys, sessies en multisig-coördinatie; de rekenkern (`packages/core`) haalt saldi, transacties en EUR-koersen op. Op het web komen nooit sleutels (ADR-0012).
- **Besluit:**
  1. **Ontwerp 1-op-1.** `apps/web/src/styles.css` is de v0-stylesheet, letterlijk. Aanvullingen staan apart in `app.css`. De markup van landing en dashboard volgt `app/page.tsx`, met dezelfde Lucide-iconen (`lucide-react` 1.17.0, de versie uit het v0-project).
  2. **Vite in plaats van Next.js.** Een statische SPA zonder server-rendering houdt de strikte CSP (`script-src 'self'`) en de bestaande hosting, checks en noodstop intact. Uit het v0-project wordt alleen markup en CSS overgenomen.
  3. **Account = passkey via de API.** "Maak je wallet" registreert een passkey (`/v1/auth/register/*`), "Open wallet" logt in (`/v1/auth/login/*`), met `@simplewebauthn/browser` 14.0.0 (de tegenhanger van `@simplewebauthn/server` in de API). Een passkey geeft toegang tot het account, **nooit ondertekenrecht**. Het beveiligingscentrum toont echte passkeys en kan andere sessies beëindigen.
  4. **Same-origin API.** De web-app roept `/v1/*` aan op de eigen origin. Lokaal proxyt Vite naar `localhost:8787`. In productie moet dezelfde origin de API serveren (Vercel-rewrite of reverse proxy), zodat de `SameSite=Strict`-cookie en `connect-src 'self'` blijven werken. **Tot de API gehost is, werkt inloggen in productie niet**; de app toont dan "server niet bereikbaar".
  5. **Wallet-data uit de rekenkern, in de browser.** Saldi en geschiedenis komen van mempool.space en Blockscout, koersen van Binance. Nieuwe module `packages/core/src/portfolio` levert saldo per asset, waarde in EUR, dagwijziging, waardeverloop per dag en een samengevoegde activiteitenlijst (getest). Koersen zijn de **dagopening (00:00 UTC)**; dat staat onder de grafiek.
  6. **Gevolgde adressen alleen op het apparaat** (`localStorage`, één module `lib/storage.ts`, gevalideerd bij inlezen). Zero-knowledge: de server ziet ze nooit. Versleutelde synchronisatie via de kluis-API (ADR-0004) volgt pas als de client-cryptografie extern is beoordeeld.
  7. **Uitloggen wist alleen cookies** (`Clear-Site-Data: "cookies"`). Wie op een gedeeld apparaat werkt, kiest "Uitloggen en dit apparaat wissen". Dit vervangt bevinding S15 van 2026-10-12 (`"cookies", "storage"`), die bij elke keer uitloggen de adressenlijst wiste.
  8. **Alleen tonen wat werkt.**
     - *Ontvangen* toont het adres met een QR-code (`qrcode-generator` 2.0.4, als SVG gerenderd, zonder `innerHTML`).
     - *Versturen* legt uit dat dit op het web alleen met een hardware wallet kan en nog in ontwikkeling is.
     - *Swap* is vervangen door *Box 3* (de rekenhulp, met de adressen uit de wallet).
     - De meldingsbel zonder functie is vervangen door *Vernieuwen*.
     - "Add funds" is *Adres toevoegen* geworden.
     - "248 places left", "KERN Europe B.V." en de nepnaam op de kaart zijn weggelaten. De kaart op de landing is gemarkeerd als *Voorbeeld*.
  9. **Sessie in de client volgt de server:**
     - na 30 minuten zonder activiteit uitloggen;
     - elke minuut `/v1/me` controleren met de header `x-kern-session-check: 1`. Die controle verlengt de sessie op de server **niet**, zodat de inactiviteitstermijn van ADR-0005 blijft gelden. Alleen een 401 telt als verlopen (dan terug naar de landing); een netwerk- of serverfout logt niemand uit;
     - "uitgelogd" alleen tonen als de server het bevestigt (204/401), anders een foutmelding (`lib/session.ts`, getest).
  10. **Fouten per adres geïsoleerd:** één onbereikbaar of te groot adres breekt de rest niet. Geschiedenis en koersen worden in het geheugen gecachet, zodat een andere periode alleen ontbrekende koersjaren ophaalt.
  11. **Opgeslagen adressen zijn niet vertrouwd:** bij inlezen opnieuw `checkAddress`, met exact de genormaliseerde vorm en de juiste chain. Ontvangen toont het **volledige** adres in blokjes van 4, met de waarschuwing dat je het alleen gebruikt als het adres van jou is.
  12. **NL/EN werkt echt** (`i18n.tsx`). De Engelse teksten komen uit het ontwerp. De box 3-rekenhulp en de juridische pagina's zijn alleen Nederlands.
- **Nieuwe dependencies (motivatie):**

| Pakket | Licentie | Waarom |
|---|---|---|
| `lucide-react` 1.17.0 | ISC | De iconen van het ontwerp, exact dezelfde versie. Geen runtime-dependencies. |
| `@simplewebauthn/browser` 14.0.0 | MIT | Passkeys, passend bij de server-bibliotheek. Geen dependencies, geen eigen crypto. |
| `qrcode-generator` 2.0.4 | MIT | QR-codes voor Ontvangen. Geen dependencies. |

- **Alternatieven:**
  - Next.js overnemen: een server-runtime, een lastigere CSP en een tweede hosting- en buildpad.
  - Adressen versleuteld op de server: nu nog niet, omdat ADR-0004 (client-crypto) eerst een externe review nodig heeft.
