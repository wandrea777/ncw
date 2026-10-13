# Architectuur

*Bijgewerkt: 2026-10-12 · v0.1*

## Doel

Een **non-custodial multisig-kluis voor ondernemers** met grote crypto-vermogens. Meerdere bestuurders of vennoten keuren transacties goed met hun eigen hardware wallets. Het bedrijf (wij) coördineert alleen en kan **nooit** zelf geld verplaatsen of zien hoeveel er in een kluis zit.

## Overzicht

```
 Gebruiker (bestuurder / vennoot / boekhouder)
 ┌───────────────────────────────────────────────┐
 │  Browser / app                                │
 │  • passkey (Face ID, Touch ID, YubiKey)       │
 │  • versleutelt en ontsleutelt alles lokaal    │   ┌──────────────────────┐
 │  • leest blockchaindata rechtstreeks ───────────▶ │ Bitcoin / Ethereum    │
 │  • ondertekent met hardware wallet            │   │ (publieke explorers,  │
 └───────────────┬───────────────────────────────┘   │ later eigen nodes)    │
                 │ HTTPS, alleen ciphertext + metadata   └──────────────────────┘
                 ▼
 ┌───────────────────────────────────────────────┐
 │  NCW API (Hono, TypeScript)                   │
 │  • passkey-authenticatie, sessies             │
 │  • organisaties, rollen, uitnodigingen        │
 │  • goedkeuringsworkflow (M-van-N)             │
 │  • manipulatiebestendig auditlog              │
 └───────────────┬───────────────────────────────┘
                 ▼
 ┌───────────────────────────────────────────────┐
 │  PostgreSQL (EU)                              │
 │  ziet: wie lid is, rollen, drempels, status   │
 │  ziet NIET: adressen, saldi, transacties,     │
 │  xpubs, handtekeningen (alleen ciphertext)    │
 └───────────────────────────────────────────────┘
```

## Waarom de server geen geld kan stelen

1. **Sleutels**: elke ondertekenaar heeft zijn eigen hardware wallet. Wij hebben geen sleutel en geen sleuteldeel.
2. **On-chain drempel**: de multisig (bijv. 2-van-3) wordt afgedwongen door de blockchain, niet door onze server. Zelfs met volledige controle over onze server kan een aanvaller niets uitgeven zonder de vereiste handtekeningen.
3. **Workflow is extra, niet de basis**: de goedkeuringsflow in de API is coördinatie en een audit trail. De veiligheid van het geld hangt er niet van af.

## Wat de server wel en niet weet

| Gegeven | Server ziet het? | Waarom |
|---|---|---|
| Namen van gebruikers, lidmaatschappen, rollen | Ja | Nodig voor autorisatie |
| Keten (BTC/ETH), drempel M-van-N | Ja | Nodig om de workflow af te dwingen |
| Tijdstip en status van voorstellen en beslissingen | Ja | Workflow en audit |
| Descriptor, xpubs, adressen, saldi | **Nee** (ciphertext) | Zero-knowledge |
| Inhoud van transacties (PSBT), bedragen | **Nee** (ciphertext) | Zero-knowledge |
| Handtekeningen | **Nee** (ciphertext) | Zero-knowledge |
| Privésleutels | **Nooit, ook niet versleuteld** | Non-custodial |

De versleuteling gebeurt in de client met een organisatiesleutel die per lid wordt "ingepakt". Het ontwerp staat in [ADR-0004](../adr/0004-zero-knowledge-en-non-custodial-multisig.md). **Status: de server is er klaar voor; de client-side cryptografie is nog niet gebouwd** en moet vóór livegang door een cryptograaf worden beoordeeld.

## Componenten

| Component | Technologie | Waarom (ADR) |
|---|---|---|
| Database | PostgreSQL 17 | [ADR-0002](../adr/0002-postgresql.md) |
| API | Hono + zod-openapi, REST `/v1`, OpenAPI 3.1 | [ADR-0003](../adr/0003-api-hono-openapi.md) |
| Authenticatie | Passkeys (WebAuthn), sessies in de database | [ADR-0005](../adr/0005-passkeys-only.md) |
| Auditlog | Hash-keten per organisatie, append-only via triggers | [ADR-0006](../adr/0006-auditlog-hash-keten.md) |
| Hosting API en database | EU (voorstel) | [ADR-0007](../adr/0007-hosting-eu.md) |
| Hosting web-app | Vercel, met Cloudflare Pages als uitwijk | [ADR-0011](../adr/0011-web-hosting-vercel.md) |
| Sleutels per platform | Web nooit; app via Wallet Core native | [ADR-0012](../adr/0012-sleutelbeheer-per-platform.md) |
| Web-wallet | v0-ontwerp (Vite), passkey-account via de API, data via `@ncw/core` in de browser, adressen alleen lokaal | [ADR-0013](../adr/0013-web-wallet-frontend.md) |

## Integraties (strategie)

| Integratie | Hoe | Waarom zo |
|---|---|---|
| **Blockchaindata** | In de client (nu: publieke explorers; later: eigen Bitcoin-node + Electrum-server in de EU) | Als de server adressen opvraagt, kent hij ze. Dat breekt zero-knowledge. |
| **Hardware wallets** (Ledger, Trezor, Coldcard, BitBox) | In de client via WebHID/WebUSB of PSBT-bestanden/QR | Sleutels verlaten het apparaat nooit |
| **Boekhouding** (Exact Online, Moneybird, Twinfield, e-Boekhouden) | Export vanuit de client (CSV/API) met toestemming van de gebruiker | Ondernemers moeten crypto op de balans van de BV verantwoorden; groene inkomstenbron |
| **Fiat on-ramp** (partner met MiCA-vergunning) | Doorverwijzing: een link die in de browser wordt gemaakt; geen webhook, de server ziet niets (ADR-0014) | De partner is de gereguleerde partij |
| **Notificaties** (e-mail/push) | Server stuurt alleen "er wacht een goedkeuring" zonder inhoud | Geen gevoelige data in mail |

## Schaal en beschikbaarheid (nu bewust eenvoudig)

- **Eén API-instantie.** De rate limiting zit in geheugen. Bij meerdere instanties: verplaatsen naar PostgreSQL of Redis.
- **Database**: managed PostgreSQL met point-in-time recovery en versleutelde back-ups (zie runbook).
- Er staat geen geld op het spel bij uitval van de server. Gebruikers kunnen altijd met hun eigen hardware wallets en descriptor-back-up bij hun geld (een *exit-pad*, nog uit te werken in de client).

## Lokaal draaien

Zie [runbooks/lokaal-ontwikkelen.md](../runbooks/lokaal-ontwikkelen.md).
