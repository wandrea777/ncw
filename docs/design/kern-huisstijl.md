# KERN-huisstijl

**Bron van waarheid:** het v0-ontwerp `kern-wallet-development-test-ui` (`app/globals.css` en `app/page.tsx`).

- [`apps/web/src/styles.css`](../../apps/web/src/styles.css) **is** die stylesheet, letterlijk; alleen de Tailwind-imports zijn weggelaten. Pas dat bestand niet aan.
- Alles wat erbij komt staat in [`apps/web/src/app.css`](../../apps/web/src/app.css) en gebruikt dezelfde tokens, typografie en vormtaal.
- Uitvoering: [ADR-0013](../adr/0013-web-wallet-frontend.md).

## Tokens (uit v0)

| Token | Waarde | Gebruik |
|---|---|---|
| `--paper` | `#f6f5f1` | Achtergrond |
| `--ink` | `#171c1b` | Tekst, donkere vlakken |
| `--forest` | `#31594b` | Accent: primaire knop, kicker, cursief accent |
| `--line` | `#d9dad4` | Lijnen en randen (1px) |
| `--soft` | `#ebeae5` | Hover, geselecteerd |
| `--muted` | `#737975` in v0; in `app.css` overschreven naar `#646a66` | Secundaire tekst (5,07:1, WCAG AA; goedgekeurd door de eigenaar op 2026-10-14) |
| `--white` | `#fffefa` | Invoervelden |

Aanvullende kleuren in `app.css`, alleen voor status:

| Kleur | Gebruik |
|---|---|
| `#8a2d20` | Fout |
| `#f1ead6` / `#5c4510` | Waarschuwing |
| `#e3ebe5` / `#1f3d32` | Gunstige uitkomst |
| `#80857f` | Rand van invoervelden: 3,45:1 op `--paper`, 3,73:1 op `--white` (WCAG 1.4.11 vraagt 3:1) |
| `#9bb5a8` | Focusrand op donkere vlakken |

## Typografie en vorm (uit v0)

- Koppen in Georgia, met het tweede deel cursief in `--forest`. Tekst in Arial.
- Kickers in hoofdletters met een streepje ervoor.
- Geen afgeronde hoeken. Geen gradiënten, behalve het vlak onder de grafiek uit v0. Geen glasmorfisme.
- Schaduwen alleen hard en verschoven, zoals bij de kaart, de toast en de dialogen.

## Patronen

| Patroon | Bron | Klassen |
|---|---|---|
| Landing (nav, hero met kaart, ticker, principes, beveiliging, vroege toegang, voettekst) | v0 | `.landing-*`, `.hero`, `.wallet-card`, `.principle-grid`, `.security-section`, `.members` |
| Dashboard (sidebar, saldo, snelle acties, grafiek, bezittingen, activiteit, tabbladen) | v0 | `.dashboard-shell`, `.sidebar`, `.balance-*`, `.quick-actions`, `.chart-*`, `.asset-row`, `.activity-row`, `.security-card` |
| Dialoog (inloggen, adres toevoegen, ontvangen, versturen) | nieuw | `.dialog`, `.field`, `.dialog-note`, `.qr`, `.address-box` |
| Lege, laad- en foutstaat | nieuw | `.empty-state`, `.status-line`, `.chart-empty` |
| Adressenlijst en passkeylijst | nieuw | `.address-list`, `.address-row` |
| Tabbalk op mobiel | nieuw | `.sidebar .side-nav` horizontaal onder 800px. In v0 verdwijnt de navigatie daar, waardoor tabbladen en uitloggen onbereikbaar waren. |
| Box 3-rekenhulp als tabblad | nieuw | `.tool`, `.card`, `.kv` |

## Wat bewust anders is dan v0

| v0 | Nu | Waarom |
|---|---|---|
| Nepsaldo, nepnaam en nep-transacties in het dashboard | Echte data van je eigen adressen | De wallet werkt nu echt |
| Kaart op de landing met "Alex de Vries" | "Voorbeeld" | Geen verzonnen persoon |
| "Add funds" | "Geld toevoegen" opent het kopen via een partner met MiCA-vergunning (ADR-0014); zonder partnersleutel "Nog niet actief". "Adres toevoegen" staat bij Bezittingen | Weer zoals in v0, nu met functie |
| Swap | Box 3 | Geen eigen swap-fee (CLAUDE.md); de rekenhulp bestaat wel |
| Meldingsbel | Vernieuwen | Meldingen bestaan nog niet |
| 1D-periode | Vervallen | De koersbron levert per dag |
| "Mainnet ▾" (netwerkkeuze) | "Mainnet · alleen-lezen" | Er is (nog) geen netwerkkeuze |
| Biometric unlock / Recovery phrase backed up / App lock | Passkey-login, Sleutels (geen), Sessie (30 minuten) | Dat zijn de feiten op het web |
| "Founding members · 248 places left", "KERN Private" | "Vroege toegang", "Box 3-overzicht · nu beschikbaar" | Geen nep-schaarste of beloftes |
| "© 2026 KERN Europe B.V." | "© KERN" en links naar privacy, voorwaarden en beveiliging | De B.V. bestaat niet; juridische links zijn verplicht |
| "LOCAL KEY STORAGE / CLEAR SIGNING / OPEN SOURCE CORE" | "Geen sleutels op onze server / passkey-login / alleen-lezen op het web" | Er is (nog) geen licentie en geen ondertekenen op het web |
| Taalknop zonder functie | Werkende NL/EN-knop, ook op mobiel in het dashboard | v0 verbergt hem daar |
| "Your keys never leave your device" | "KERN never asks for your recovery phrase" | Op het web zijn er geen sleutels; dit is wat wél waar is |
| p2: "Clear signing, transparent fees, human-readable approvals" | "Passkey sign-in, no passwords or SMS. A strict security policy in your browser and no trackers." | Ondertekenen bestaat nog niet |
| "Founding members get lifetime access to KERN Private…" / "Request an invitation" | Vroege toegang: wat er nu is en wat volgt / "Create your wallet" | Geen beloftes zonder mechanisme |
| Referral-rij (niet klikbaar) | Klikbaar: "Passkey sign-in · No password, no SMS" opent "Maak je wallet" | Een pijl moet iets doen |
| Dashboardvoet "Protected by KERN security architecture · v0.9.4 · Demo environment" | "Non-custodial: KERN stores no keys · versie (commit) · watch-only on mainnet" | Feiten in plaats van een claim |
| "Open wallet" alleen in de desktopnav | Ook in het mobiele menu | v0 verbergt `.nav-cta` op mobiel |
| `.add-button` (op mobiel alleen een icoon) in de lege staat en het beveiligingscentrum | `.inline-action`: dezelfde stijl, maar het label blijft zichtbaar | Een knop met alleen een icoon is daar onduidelijk |
| Nieuwe raakvlakken | Minimaal 44px | WCAG 2.5.5; de kleine raakvlakken uit v0 zelf (periodes, oogje) zijn ongewijzigd |
| Rand van invoervelden | `#80857f` (3,45:1 op paper) | WCAG 1.4.11 |

## Bekende punten (nog niet opgelost)

- **Kleine tekst.** v0 gebruikt 9–11px voor labels; dat is klein voor leesbaarheid.
- Contrast uit v0: navigatie-items `#78807b` (3,72:1), de centen van het saldo `#8d968f` (2,79:1), en `--muted` op `--soft` (3,69:1).
- Raakvlakken uit v0 kleiner dan 44px: periodeknoppen, oogje, vernieuwen.
- De box 3-rekenhulp (tabblad) en de juridische pagina's zijn alleen Nederlands. Foutmeldingen van de chainbronnen zijn in het Engels als generieke melding vertaald.
