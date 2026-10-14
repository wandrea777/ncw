# ADR-0012: Sleutelbeheer per platform en ondersteunde chains

- **Status:** Aangenomen · 2026-10-13 · bevestigt het besluit "De wallet op het web" uit [PLAN.md §4](../../PLAN.md)
- **Context:** de eigenaar wil een complete non-custodial wallet die "zo veilig mogelijk" is, met **Bitcoin én EVM**. Een aangeleverde prompt vroeg om een hot wallet in de browser en op mobiel tegelijk. Een herstelzin in de browser is het grootste risico dat we kunnen nemen: één XSS-lek, één gecompromitteerde dependency of één overgenomen hostingaccount raakt dan alle gebruikers tegelijk. Daarnaast geldt vanaf 9 december 2026 de nieuwe productaansprakelijkheid tegenover consumenten.
- **Besluit:**

| Platform | Sleutels | Wat kan de gebruiker |
|---|---|---|
| **Web** | **Nooit** privésleutels of herstelzinnen, ook niet versleuteld | Alleen-lezen (adressen volgen, box 3). Later: ondertekenen met een **hardware wallet** (Ledger/Trezor via WebHID/WebUSB). De sleutel verlaat het apparaat nooit en de gebruiker controleert adres en bedrag op het scherm van het apparaat. |
| **Mobiele app** (Android eerst, daarna iOS) | Hot wallet via **Trust Wallet Core (native build, nooit WASM)**. Secure Enclave en StrongBox ondersteunen geen secp256k1: de **seed wordt versleuteld met een sleutel die daar wél in zit** (Keychain `ThisDeviceOnly` / Keystore), zonder iCloud- of Android-back-up, ongeldig bij een nieuwe biometrische inschrijving. Tijdens ondertekenen staat de seed kort in het geheugen van de native laag, nooit in JavaScript. | Aanmaken, importeren, herstellen, versturen en ontvangen. **Alleen testnet tot een onafhankelijke audit is afgerond.** Bedoeld voor kleinere bedragen; grote vermogens horen in de multisig-kluis met hardware wallets (ADR-0008). |
| **Server** | Nooit | Coördinatie en versleutelde metadata (ADR-0004). |

  - **Chains:** Bitcoin (BIP-84, native SegWit) en EVM: Ethereum plus Base en Arbitrum. Meer chains betekent meer aanvalsoppervlak, dus elke extra chain krijgt een eigen ADR.
  - **Inloggen is geen ondertekenrecht.** Een passkey (ADR-0005) bewijst wie je bent tegenover de server, maar geeft nooit toegang tot sleutels. De herstelzin blijft het enige herstelmiddel van een hot wallet.
  - **Bibliotheken, geen eigen cryptografie:** Wallet Core (native) in de app; voor transacties via een hardware wallet op het web gebruiken we de officiële Ledger- en Trezor-bibliotheken, en `@scure/btc-signer` en `viem` alleen om ongetekende transacties op te bouwen. Elke dependency wordt vooraf beoordeeld (licentie, onderhoud, supply chain).
  - **Volgorde:** (1) alleen-lezen op het web, (2) hardware wallet op het web op testnet, (3) mobiele app op testnet, (4) audit, (5) mainnet.
- **Dreigingen die dit besluit niet wegneemt (en maatregelen):**
  - *Kwaadaardige app-update:* raakt ook alle app-gebruikers tegelijk. Maatregelen:
    - geen OTA-code-updates;
    - signeersleutels en store-accounts met hardware-2FA;
    - gefaseerde uitrol;
    - reproduceerbare builds van Wallet Core.
  - *Blind ondertekenen op EVM via een hardware wallet* (permits, approvals, contract-calls): eerst alleen gewone transfers, alleen clear-signing, en approvals expliciet tonen met een waarschuwing.
  - *Verkeerd ontvangstadres / address poisoning:* het adres laten bevestigen op het scherm van de hardware wallet, begin en eind uitlichten, en waarschuwen bij lijkende adressen.
  - *Gecompromitteerde web-code bij ondertekenen met een hardware wallet:* het scherm van het apparaat is de laatste controle. Een strikte CSP en Trusted Types vóór de start van die fase.
- **Gevolgen:**
  - Check MICA-1 (`geen-sleutelbibliotheken`) blijft in fase 0 hard. Zodra stap 2 begint, vervangen we hem door een strengere control: "de web-bundle bevat geen code die sleutels genereert of opslaat". **Gedaan op 14-10-2026 met [ADR-0015](0015-versturen-met-ledger-web.md)**, samen met Trusted Types in de CSP en control MICA-4 (alleen testnet).
  - Geen dApp-browser, WalletConnect, swaps of staking in de MVP (PLAN.md §4). Swaps komen alleen via een partner met vergunning.
- **Alternatieven:**
  - Een versleutelde herstelzin in de browser (MetaMask-model): verworpen vanwege het risico voor alle gebruikers tegelijk.
  - MPC of een sleuteldeel bij ons: verworpen, want dan zitten we binnen de MiCA-perimeter (PLAN.md §3).
  - Een webview-wrapper als app: verworpen, want die geeft geen toegang tot Secure Enclave of Keystore met dezelfde garanties.
