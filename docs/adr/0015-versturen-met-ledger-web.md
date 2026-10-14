# ADR-0015: Versturen met een Ledger in de browser (Bitcoin, alleen testnet)

- **Status:** Aangenomen · 2026-10-14 · stap 2 uit de volgorde van [ADR-0012](0012-sleutelbeheer-per-platform.md)
- **Context:** de eigenaar wil versturen via een hardware wallet. Volgens ADR-0012 komen sleutels nooit in de browser. Op het web mag je alleen ondertekenen met een hardware wallet, eerst op testnet. De eigenaar koos Ledger als eerste apparaat en Bitcoin als eerste chain.

## Besluit

| Onderdeel | Keuze | Waarom |
|---|---|---|
| Apparaat | **Ledger** via **WebHID**, app **"Bitcoin Test"** (minimaal 2.1, het PSBT-protocol met wallet policies) | Alle code draait in onze eigen bundle, dus de CSP blijft `script-src 'self'`. Trezor Connect laadt een iframe van een derde partij. |
| Netwerk | **Bitcoin testnet4** via mempool.space | Geen echt geld tot audit en juridische toets (MICA-2). Testnet3 is uitgefaseerd. |
| Account | BIP-84 `m/84'/1'/0'`, policy `wpkh(@0/**)`, gap-limiet 20 | Standaard, en hetzelfde als Ledger Live, zodat de gebruiker bij zijn geld kan zonder KERN. |
| Bouwen van de transactie | In de browser met `@scure/btc-signer` (selectie van UTXO's, PSBT v0) | Bewezen bibliotheek (ADR-0012), geen eigen cryptografie. |
| Adressen afleiden | Lokaal uit de `tpub` met `@scure/bip32` (alleen publieke afleiding) | 40 adressen opvragen bij het apparaat duurt te lang. Voor gebruik controleren we adres 0/0 tegen het apparaat. |
| Ondertekenen | `@ledgerhq/ledger-bitcoin` (officiële client), `@ledgerhq/hw-transport-webhid` | De officiële bibliotheken van Ledger. Ondertekenen gebeurt op het apparaat, na bevestiging op het scherm. |
| Uitzenden | Rechtstreeks vanuit de browser naar mempool.space | De KERN-server ziet geen xpub, adres of transactie (zero-knowledge, CLAUDE.md). |
| Opslag | Niets: xpub, adressen en transactie leven alleen zolang de dialoog open is | Minder om te lekken; geen nieuwe opslag (COOK-1). |

## Controles vóór en na ondertekenen

Getest in `packages/core/test/send-bitcoin.test.ts`; de app-controles (1) in `apps/web/test/ledger.test.ts`.

1. Een ontvangstadres moet een geldig **testnet**-adres zijn. Een mainnet-adres geeft een aparte foutmelding. Een `xpub` (mainnet) wordt geweigerd, net als de Ledger-app "Bitcoin" (mainnet).
2. **Eigen afleiding = apparaat:** adres 0/0 uit onze afleiding moet gelijk zijn aan dat van de Ledger. Anders stoppen we, omdat wisselgeld anders naar een vreemd adres zou gaan.
3. **Onafhankelijke controle van het plan** (`verifyPlan`): precies één uitvoer naar de ontvanger met exact het bedrag, hooguit één uitvoer naar ons eigen wisselgeldadres en geen andere uitvoer. De vergoeding blijft onder twee grenzen: hooguit 200 sat/vB, en absoluut hooguit 50.000 sat. Een liegende fee-API kan het tarief alleen binnen die grenzen opdrijven, en de Ledger toont de vergoeding.
4. **Vorige transacties** (verplicht voor de Ledger bij SegWit v0) moeten bij de invoer passen: zelfde txid, zelfde bedrag en script. Zo werkt een liegende API niet als fee-aanval.
5. **Handtekeningen:** precies één per invoer, van de sleutel die we in `bip32Derivation` noemden. Elke handtekening wordt geverifieerd tegen de BIP-143-sighash en moet **SIGHASH_ALL** zijn. Een gecompromitteerde bibliotheek kan dus geen handtekening laten zetten die de uitvoer niet dekt (bijv. NONE|ANYONECANPAY). Dit is verifiëren met `@noble/curves`, geen eigen cryptografie.
6. **Uitzenden:** het transactie-ID dat het netwerk teruggeeft, moet gelijk zijn aan het ID dat we zelf berekenden.
7. **Address poisoning:** de app waarschuwt als het ontvangstadres aan begin en eind lijkt op een eigen of gevolgd adres, maar een ander adres is. Het volledige adres staat in blokjes van 4. De gebruiker vergelijkt het met het scherm van de Ledger.
8. Alleen UTXO's die mempool.space **bevestigd** noemt worden uitgegeven. Een leugen daarover leidt niet tot verlies (de Ledger tekent alleen wat je ziet), maar kan een transactie laten weigeren.
9. **Scan met plafond:** maximaal 1000 adressen per tak; kapotte of dubbele UTXO-gegevens worden geweigerd of ontdubbeld.
10. Versturen naar het eigen **wisselgeldadres** krijgt een eigen foutmelding.
11. Na ondertekenen: een fout tijdens uitzenden heet **onzeker**, niet "niets verstuurd". De UI wijst naar mempool.space en blokkeert opnieuw versturen in dezelfde sessie.

## Beveiliging van de webcode

Volgens ADR-0012 moest dit vóór deze fase geregeld zijn:
- **Trusted Types** in de CSP (`require-trusted-types-for 'script'; trusted-types 'none'`). Elke `innerHTML`-achtige toewijzing wordt dan geweigerd; dat is gecontroleerd op de productie-build.
- `Permissions-Policy: hid=(self)` (WebHID alleen voor onze eigen origin); `usb=()` blijft uit.
- De Ledger- en transactiecode wordt **lui** geladen (eigen chunks), alleen als iemand op Versturen klikt.
- **Control MICA-1 is vervangen** door de strengere variant uit ADR-0012 (check `geen-sleutelbibliotheken`):
  - geen herstelzin- of hot-wallet-bibliotheken in de bundle;
  - geen API's die privésleutels maken of in software ondertekenen in **onze eigen code**, inclusief elke `.sign(`-aanroep (getest in `compliance/scripts/test/keyrules.test.mjs`);
  - Ledger-code alleen in `apps/web/src/lib/ledger.ts`.
  - **Eerlijk:** de lui geladen Ledger-chunk bevat via indirecte bibliotheken wél functies die sleutels kunnen maken (`ECPairFactory`, `BIP32Factory`, `makeRandom`). We roepen die niet aan, maar de check controleert eigen code, niet de bundle. Een AST-regel en een allowlist op `dist/` staan op de lijst vóór mainnet.
- **CI:** `npm audit signatures` controleert de registry-handtekeningen van alle pakketten.
- **Nieuwe control MICA-4** (check `alleen-testnet`): `TEST_NETWORK`, de testnet4-API, de weigering van `xpub` en de app-naam "Bitcoin Test" staan vast. Overstappen naar mainnet vraagt een nieuwe ADR, een audit en de toets MICA-2.

## Nieuwe dependencies (motivatie)

| Pakket | Licentie | Waarom |
|---|---|---|
| `@scure/btc-signer` 2.4.1 | MIT | PSBT bouwen, UTXO-selectie en afronden. Van dezelfde auteur en op dezelfde noble-stack als `@noble/hashes` en `@scure/base`, die we al gebruiken. |
| `@scure/bip32` 2.4.0 | MIT | Publieke afleiding uit de `tpub`. Voegt geen nieuwe indirecte pakketten toe. |
| `@noble/curves` 2.4.0 | MIT | Handtekeningen van het apparaat verifiëren (SIGHASH_ALL). Zat al indirect in de bundle via `@scure/btc-signer`. |
| `@ledgerhq/ledger-bitcoin` 0.3.1 | Apache-2.0 | De officiële client voor de Bitcoin-app (de opvolger van het verouderde `ledger-bitcoin`). |
| `@ledgerhq/hw-transport-webhid` 6.36.0 | Apache-2.0 | De officiële WebHID-transportlaag. |
| `buffer` 6.0.3 | MIT | De Ledger-bibliotheken gebruiken Node's globale `Buffer`. Alleen geladen in de luie Ledger-chunk. |

Overwogen en afgewezen:
- **Ledger Device Management Kit**: haalt `crypto-js` (niet meer onderhouden) en Sentry-modules binnen, plus xstate en inversify.
- **`@ledgerhq/hw-app-btc`**: 76 pakketten in plaats van 44, met oude Node-polyfills (`readable-stream`, `cipher-base`).

Indirect komen via `@ledgerhq/ledger-bitcoin` mee: `bitcoinjs-lib`, `bip32`, `ecpair`, `wif`, `bip174`, `bip32-path` (één beheerder, laatste versie 2022), `@bitcoinerlab/descriptors`, `descriptors-core`, `miniscript` en `secp256k1` (alle vier één beheerder), `valibot`, `lodash.memoize`, `semver`, plus tweede kopieën van `@noble/hashes`/`@noble/curves`/`@scure/base` 1.x. Ook `@noble/curves` 2.4.0 staat nu direct in `@ncw/core` (handtekeningen verifiëren). We gebruiken de indirecte pakketten niet zelf, en de check verbiedt ze als eigen dependency. **Risico:** een overgenomen npm-account van één beheerder kan de PSBT aanpassen vóór die naar het apparaat gaat. De controles hierboven en het scherm van de Ledger vangen dat op voor zover het om uitvoer, bedrag en vergoeding gaat. Vóór mainnet: de client minimaliseren of vendoren.

## Wat dit niet oplost

- **Gecompromitteerde webcode** kan een ander adres laten zien dan in de transactie staat. De laatste controle is het scherm van de Ledger, en de UI zegt dat expliciet.
- **Privacy:** mempool.space ziet welke adressen bij elkaar horen, en je IP-adres. Dat staat in de privacyverklaring.
- **Er is nog niet getest met een echte Ledger.** Volg het runbook `docs/runbooks/testen.md` §5 vóór de eerstvolgende release-tag en leg de testnet4-txid vast in het QA-verslag.
- `@ledgerhq/logs` biedt een globale log-hook waarmee een script op onze origin APDU's (xpub, PSBT) kan meelezen. Onze CSP staat geen vreemde scripts toe; een eigen indexer en het minimaliseren van de client staan op de lijst vóór mainnet.
- Vóór mainnet ook: een tweede bron voor de vergoeding, en een eigen Esplora/Electrum-server in de EU in plaats van mempool.space (privacy: ±40 adressen in één keer vanaf één IP).
- EVM (Ethereum/Base/Arbitrum) en Trezor komen later, elk met een eigen ADR.
