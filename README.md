# KERN

Non-custodial multisig-kluis voor **ondernemers met grote crypto-vermogens**: meerdere bestuurders keuren transacties goed met hun eigen hardware wallets. De server coördineert alleen, bewaart nooit sleutels en ziet kluisgegevens alleen versleuteld.

De **web-wallet** volgt je publieke BTC- en ETH-adressen in euro's, met inloggen via passkey. Versturen kan alleen met een Ledger, en voorlopig alleen op Bitcoin testnet4 (ADR-0015). Daarnaast de **Box 3-rekenhulp**: berekent volledig in de browser of de tegenbewijsregeling (Opgaaf werkelijk rendement) voordeliger is.

Documentatie: [docs/README.md](docs/README.md) · Businessplan: [PLAN.md](PLAN.md) · Compliance: [compliance/README.md](compliance/README.md) · Werkafspraken: [CLAUDE.md](CLAUDE.md)

## Structuur

| Map | Inhoud |
|---|---|
| `packages/core` | Rekenkern (TypeScript): box 3-regels, adresvalidatie, blockchain- en koersdata, waardering. Wordt straks ook door de mobiele app gebruikt. |
| `apps/api` | Backend: Hono + PostgreSQL, passkeys, multisig-goedkeuringen, auditlog (zie [docs/architecture](docs/architecture/overview.md)) |
| `apps/web` | KERN web-wallet (React + Vite): het v0-ontwerp, gekoppeld aan de API (passkeys) en de rekenkern (saldi, koersen, box 3). Geen sleutels in de browser; versturen alleen met een Ledger op testnet (ADR-0012, ADR-0013, ADR-0015). Gehost op Vercel (ADR-0011). |
| `compliance` | Register, automatische checks, CRA-incidentbeheer, meldsjablonen |
| `.github/workflows` | CI, dagelijkse security watch, meldklok, release met bewijsbundel, noodstop |
| `.githooks` | Commit-hook: geen AI-assistent als (co-)auteur |

## Ontwikkelen

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run dev:api
```

```bash
npm test
```

```bash
npm run compliance
```

## Bekende beperkingen Box 3-rekenhulp (v0.1)

- Alleen BTC (losse adressen, nog geen xpub) en native ETH (nog geen ERC-20-tokens).
- Eén belastingplichtige, geen fiscale partner.
- Jaren 2024–2026; parameters nog niet geverifieerd (release geblokkeerd tot verificatie).
- Koersen: Binance-dagopening (00:00 UTC). EUR-paren bestaan vanaf januari 2020.
