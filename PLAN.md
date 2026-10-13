# KERN (werktitel NCW): Nederlandse non-custodial wallet, businessplan en bouwplan

> **Update 13 oktober 2026:** het bedrijf en de wallet heten **KERN** ([ADR-0010](docs/adr/0010-naam-kern.md)). De web-app draait voorlopig op Vercel ([ADR-0011](docs/adr/0011-web-hosting-vercel.md)); let op: het Hobby-plan is niet-commercieel. Bitcoin én EVM, sleutels nooit op het web ([ADR-0012](docs/adr/0012-sleutelbeheer-per-platform.md)).

> **Update 12 oktober 2026:** de doelgroep is aangescherpt naar **ondernemers met grote crypto-vermogens** (zakelijke non-custodial multisig-kluis met abonnement). Zie [ADR-0008](docs/adr/0008-doelgroep-ondernemers.md) en [docs/product/zakelijk.md](docs/product/zakelijk.md). De onderstaande analyse (juridisch kader, groene verdienmodellen, aansprakelijkheid) blijft geldig.

*Stand van zaken: 12 oktober 2026. Dit is een onderbouwde inschatting en geen juridisch of fiscaal advies. De punten die met ⚖️ zijn gemarkeerd moet je vóór de lancering door een jurist laten toetsen.*

---

## 0. Samenvatting

1. **Een custodial wallet valt af.** Daarvoor heb je een MiCA-vergunning (CASP) nodig, minimaal €125.000 eigen vermogen, Wwft-compliance en toezicht door de AFM. Dat past niet bij "zonder vergunning" en ook niet bij "voor de lol naast je studie".
2. **Non-custodial is legaal zonder vergunning,** zolang je verdient aan **software** en aan **doorverwijzingen naar partijen met een vergunning**. Verdien nooit per transactie die door jouw systeem loopt.
3. **"0 aansprakelijkheid" bestaat niet.** Sinds 11 september 2026 geldt de meldplicht uit de Cyber Resilience Act. Vanaf 9 december 2026 valt software onder de nieuwe productaansprakelijkheid, en die kun je tegenover consumenten niet contractueel uitsluiten. Je kunt het risico wel heel klein maken (zie §6).
4. **Het geld zit niet in de wallet zelf,** maar in de **Box 3- en OWR-belastingfunctie** en in de **iDEAL/Wero-doorverwijzing**.
5. **Mijn advies over de volgorde:** begin met een **read-only Box 3-tool**. Die heeft geen sleutels, dus ook geen aansprakelijkheid voor verloren sleutels, en levert wél direct omzet op. Bouw de wallet daarna bovenop de gebruikers die je dan al hebt.
6. **Over "grof geld":** daarvoor heb je ongeveer 50.000 tot 100.000 actieve gebruikers nodig (zie de rekensom in §3). Dat is haalbaar maar niet waarschijnlijk. Reken op een leuk bijverdienste-project met een kleine kans op echt veel.

---

## 1. Waarom geen custodial wallet

| | Custodial (jij beheert sleutels) | Non-custodial (gebruiker beheert sleutels) |
|---|---|---|
| MiCA-vergunning (Verordening 2023/1114) | **Verplicht**: bewaring en beheer is een cryptodienst | **Niet nodig**: overweging 83 sluit aanbieders van hard- en software voor non-custodial wallets uit |
| Minimaal eigen vermogen | **€125.000** (MiCA, bijlage IV, klasse 2) | — |
| Wwft / AMLR (antiwitwas) | Verplicht: KYC, transactiemonitoring, meldingen bij FIU | Geen meldingsplichtige instelling |
| Travel Rule (Verordening 2023/1113) | Verplicht | Geldt niet voor jou (wel voor je ramp-partners) |
| DAC8 (belastingrapportage) | Verplicht sinds 2026 | Geldt niet |
| DORA (IT-weerbaarheid) | Verplicht | Geldt niet |
| Faillissementsrisico | Klantgeld moet afgescheiden zijn (Haentjens e.a., 2020) | Niet van toepassing |

**Conclusie:** custodial betekent een bedrijf met compliance-team, kapitaal en toezicht. Non-custodial is het enige model dat past bij je randvoorwaarden.

---

## 2. Juridisch kader: wat geldt wél voor een non-custodial wallet

| Regel | Geldt voor jou? | Wat moet je doen |
|---|---|---|
| **MiCA** | Nee, zolang je nooit sleutels of geld beheert en zelf geen cryptodienst levert (geen ruil, geen orderdoorgifte, geen portefeuillebeheer) | Ontwerp het zo dat je *technisch niet kunt* custodial worden. Geen eigen swap-fee (§3). ⚖️ |
| **Wwft / AMLR (vanaf juli 2027)** | Nee | — |
| **Sanctiewet 1977 / EU-sancties** | **Ja, voor iedereen** | Geen privacy- of mixingfuncties. Werk alleen met partners die zelf sanctiescreening doen. |
| **Cyber Resilience Act (Verordening 2024/2847)** | **Ja**, zodra je het product commercieel aanbiedt (ook gratis met verdienmodel) | **Nu al:** actief misbruikte kwetsbaarheden binnen 24 uur melden bij de CSIRT en ENISA, binnen 72 uur een vervolgmelding, en gebruikers informeren. **Vanaf 11 december 2027:** CE-markering, risicobeoordeling, SBOM, beveiligingsupdates gedurende de ondersteuningsperiode. |
| **Productaansprakelijkheid (Richtlijn 2024/2853, NL-wetsvoorstel 36 906)** | **Ja**, voor software die vanaf 9 december 2026 op de markt komt | Software geldt als "product". Schade door beschadiging of vernietiging van data die niet voor beroepsdoeleinden wordt gebruikt valt eronder, en verloren crypto zou daaronder kunnen vallen. ⚖️ **Niet uit te sluiten tegenover consumenten.** Gratis open source *buiten een handelsactiviteit* valt erbuiten, maar dat ben jij niet. |
| **Consumentenrecht (BW boek 6 en 7, digitale inhoud)** | Ja, ook als gebruikers "betalen" met data | Duidelijke voorwaarden. Een uitsluiting voor opzet of grove schuld is nietig. Beperkingen moeten redelijk zijn (art. 6:233 en 6:237 BW). |
| **AVG** | Ja. Een walletadres plus IP-adres is een persoonsgegeven. | Zo min mogelijk data verzamelen, geen tracking, een privacyverklaring. Leg uit welke RPC-provider adressen ziet. |
| **Reclame en marketing** | Ja | Nooit "rendement", "rente", "gegarandeerd" of "100% veilig" zeggen. Geen promotie van diensten zonder vergunning. |
| **App stores** | Ja | **Apple:** walletapps alleen via een account als *organisatie*, dus een rechtspersoon met D-U-N-S-nummer, in Nederland in de praktijk een **BV**. **Google Play:** non-custodial wallets zijn uitgezonderd van de crypto-vergunningseis. |
| **Btw** | Ja | Premium is btw-plichtig. Apple en Google dragen de btw af bij in-app-aankopen. KOR mogelijk onder €20.000 omzet. Laat de boekhouder bepalen hoe je partnercommissies behandelt. |
| **Merkenrecht** | Ja | Eigen naam en logo, check bij BOIP. **Geen** "Trust" in de naam of het logo, en geen nagemaakte UI. |

---

## 3. Verdienmodel: alleen groen

### Wel doen

| # | Inkomstenbron | Waarom het groen is |
|---|---|---|
| 1 | **iDEAL/Wero-koopknop via een partner met vergunning** (bijv. MoonPay, Ramp, Transak). Je krijgt een partnercommissie, vaak 0,5–1%, onderhandelbaar. | De partner sluit het contract met de gebruiker, doet de KYC en verwerkt de betaling. Jij verwijst alleen door. **Check de partner in het ESMA MiCA-register.** |
| 2 | **Premium "Belasting"**: Box 3-overzicht per peildatum (1 januari), een **OWR-rapport (Opgaaf werkelijk rendement)** en straks de berekening voor de Wet werkelijk rendement. Bijv. €29–49 per jaar. | Pure software. Grote vraag: crypto valt in Box 3 onder het forfaitaire rendement van ongeveer 6%, en met de OWR kunnen beleggers met verlies of laag rendement minder betalen. |
| 3 | **Swaps via de widget van een partner met vergunning, met omzetdeling** | De partner is de CASP en voert de ruil uit. Jij krijgt een vergoeding van de partner, niet uit de transactie van de gebruiker. ⚖️ Laat het contract toetsen. |
| 4 | **B2B: licentie voor boekhouders en belastingadviseurs** (OWR- en Box 3-rapporten voor hun klanten) | Software-licentie. Hogere omzet per klant, weinig klanten nodig. |

### Niet doen (grijs of rood)
- Een eigen fee in swap-transacties
- Staking-commissies, of opbrengsten via jouw adres laten lopen
- Trading-bots of automatisch beleggen
- Advertenties van DeFi-protocollen met "rendement"
- Server-side sleutelback-up, MPC waarbij jij een sleuteldeel hebt, "social recovery" via jouw server
- Zelf euro's ontvangen of uitbetalen

### Rekensom (illustratief, aannames uitgeschreven)

Aannames: 5% van de actieve gebruikers koopt maandelijks €250 via de ramp tegen 0,75% commissie, 4% neemt premium à €35 per jaar (min ~15% Apple/Google), en B2B en swaps tellen niet mee.

| Actieve gebruikers | Ramp per jaar | Premium per jaar | **Totaal per jaar** |
|---|---|---|---|
| 1.000 | ~€1.100 | ~€1.200 | **~€2.300** |
| 10.000 | ~€11.000 | ~€12.000 | **~€23.000** |
| 100.000 | ~€112.000 | ~€119.000 | **~€230.000** |

**Les:** omzet groeit lineair met het aantal gebruikers. Het moeilijke deel is dus niet de techniek maar **gebruikers binnenhalen**. De belastingfunctie is je marketingverhaal ("je crypto-aangifte in 2 minuten"). B2B via boekhouders is het snelste pad naar serieuze omzet met weinig gebruikers.

---

## 4. Product

**Positionering:** *De crypto-wallet voor Nederlanders: kopen met iDEAL/Wero, en je Box 3-aangifte in 2 minuten.*

### Fase 0: read-only Box 3/OWR-tool (web, geen sleutels)
- De gebruiker plakt publieke adressen (BTC, ETH en L2's, SOL) of leest ze in via een xpub.
- **Alles draait in de browser.** Chaindata wordt client-side opgehaald, dus jij slaat geen adressen op. Dat houdt de AVG simpel.
- Resultaat: waarde op 1 januari per jaar, transactieoverzicht, OWR-berekening, PDF-export.
- Premium-paywall voor de PDF en meerdere jaren. B2B-variant met meerdere klanten.
- **Geen privésleutels, dus geen risico op sleutelverlies.** Dit is de laagste aansprakelijkheid die mogelijk is.

### Fase 1: de wallet (Android eerst, daarna iOS)
**MVP-functies:**
- Wallet aanmaken of importeren (BIP-39), alleen **Bitcoin + Ethereum + 1–2 L2's (Base, Arbitrum)**. Minder chains betekent minder aanvalsoppervlak.
- Ontvangen en versturen, met adrescontrole en waarschuwing tegen address poisoning.
- Een iDEAL/Wero-koopknop via de partner.
- De Box 3/OWR-module uit fase 0 ingebouwd.
- Back-up van de herstelzin met een verplichte check (gebruikers verliezen vaak hun herstelzin: Voskobojnikov e.a., 2021).

**Bewust niet in de MVP:** dApp-browser, WalletConnect, NFT's, staking, swaps. Die komen later en alleen via partners.

**De wallet op het web (besluit 12 oktober 2026):** op het web komen **geen privésleutels in de browser**. Wie de webserver overneemt, kan alle gebruikers in één keer kwaadaardige code sturen (zelfde risico als OTA-updates), en een browser heeft geen Secure Enclave. Op het web komen daarom alleen:
- **watch-only** (de huidige Box 3-tool, adressen volgen);
- later **ondertekenen via een hardware wallet** (Ledger/Trezor via WebHID/WebUSB). De sleutel verlaat het apparaat nooit en de gebruiker controleert het adres op het scherm van het apparaat. Ook dan heeft onze software nooit sleutels.

Hot wallets (sleutels in de app) komen alleen in de native app. Daarmee blijft het risico op productaansprakelijkheid op het web vrijwel nul.

---

## 5. Techniek

### 5.1 Check van de aangeleverde tekst over Trust Wallet

| Bewering | Klopt? | Toelichting |
|---|---|---|
| Wallet Core is volledig open source | ✅ | **Apache-2.0**, commercieel bruikbaar en mag in een gesloten app. C++-kern met Swift- en Kotlin-bindings (stabiel). Rust, Kotlin Multiplatform, WASM en NPM zijn beta. |
| Assets-repo is openbaar | ✅ | Let op: tokenlogo's zijn merken van de projecten. |
| TrustConnect SDK | ✅ maar niet relevant | Uitgebracht in mei 2026 onder Apache-2.0. Het is een bibliotheek **voor dApps** om met wallets te verbinden, **niet om een wallet te bouwen**. De link in de tekst (`trustwallet/developer`) is de documentatie-repo. |
| De apps zelf zijn closed source | ✅ | Je kunt de Trust Wallet-app dus niet forken. |
| Gem Wallet is volledig open source | ✅ | **GPL-3.0**: native SwiftUI- en Kotlin-apps met een Rust-kern. |
| De open-source kern is dus veilig | ⚠️ **Niet automatisch** | In 2023 zat er een kritieke fout in de **WASM-build van Wallet Core**: entropie van maar 32 bit (mt19937), dus slechts ~4 miljard mogelijke herstelzinnen. Dit is actief misbruikt (CVE-2023-31290, ontdekt door Ledger Donjon). **Open source is pas veilig als iemand het controleert.** |

### 5.2 Keuze voor de opbouw

| Optie | Voordeel | Nadeel |
|---|---|---|
| **A. Gem Wallet forken** (GPL-3.0) | Snelst: twee volwaardige apps | Jouw app moet ook GPL zijn. ⚖️ **GPL en de App Store-voorwaarden botsen** voor wie de code niet zelf heeft geschreven. Je hebt een eigen backend nodig (Gem gebruikt eigen servers). |
| **B. Eigen app op Wallet Core (Apache-2.0)** ✅ **aanbevolen** | Juridisch schoon, mag closed of open, geen GPL-conflict met Apple | Meer bouwwerk, maar Claude kan het grootste deel schrijven |
| C. Alles zelf (cryptografie zelf schrijven) | — | ❌ **Nooit doen.** |

**Aanbevolen stack (optie B):**

```
┌───────────────────────────────────────────────┐
│  UI: React Native / Expo (TypeScript)         │  ← Claude bouwt dit grotendeels
│  - schermen, Box 3-module, ramp-widget        │
├───────────────────────────────────────────────┤
│  Native module (Swift / Kotlin)               │  ← dunne laag
│  - Wallet Core (native build, NIET WASM)      │
│  - sleutelopslag: iOS Secure Enclave /        │
│    Keychain, Android Keystore (StrongBox)     │
│  - JS krijgt alleen: adressen + ondertekende  │
│    transacties. Sleutels verlaten de native   │
│    laag nooit.                                │
├───────────────────────────────────────────────┤
│  Extern (geen eigen server met gebruikersdata)│
│  - RPC: Alchemy / Infura / QuickNode (free)   │
│  - Koersen: CoinGecko (check commerciële      │
│    voorwaarden)                               │
│  - Ramp: partner-widget (MiCA)                │
└───────────────────────────────────────────────┘
```

**Website en Box 3-tool (fase 0):** een statische web-app op **Cloudflare Pages** (gratis, commercieel gebruik toegestaan). Let op: het **Vercel Hobby-plan is alleen voor niet-commercieel gebruik**.

### 5.3 Beveiligingseisen (afgeleid uit de literatuur)

Erinle e.a. (2025) analyseerden **84 incidenten (2012–2024, $5,4 mld schade)**. Het overgrote deel ging over sleutelbeheer, de supply chain en misleiding van gebruikers. Daaruit volgt:

| # | Eis | Waarom |
|---|---|---|
| 1 | **Entropie alleen van de CSPRNG van het besturingssysteem**, via de native Wallet Core-build | CVE-2023-31290, Milk Sad (2023) en de Profanity-bug (Wintermute, ~$160M) gingen allemaal over zwakke entropie |
| 2 | Sleutels versleuteld in Secure Enclave of Keystore, ontgrendelen met biometrie | Malware op het apparaat (Houy e.a., 2023) |
| 3 | **Geen OTA-code-updates** (Expo Updates uit). Elke wijziging gaat via store-review. | Een OTA-kanaal is een directe manier om kwaadaardige code in de app te krijgen |
| 4 | Zo min mogelijk npm-afhankelijkheden, lockfile, Dependabot, SBOM | Supply-chain-aanvallen. SBOM is ook verplicht onder de CRA. |
| 5 | Adresvergelijking op begin én eind, waarschuwing bij een nieuw of lijkend adres | Address poisoning |
| 6 | Transactie leesbaar tonen voor ondertekening (EIP-712), geen "blind signing" | Misleiding van gebruikers (Erinle e.a., 2025) |
| 7 | Verplichte back-upcheck met UX volgens onderzoek | Gebruikers begrijpen sleutelbeheer slecht (Eskandari e.a., 2015; Krombholz e.a., 2016; Mai e.a., 2020) |
| 8 | **Open source + reproduceerbare builds** | Vertrouwen, controleerbaarheid, en het helpt bij de CRA |
| 9 | Een procedure om binnen 24 uur een melding te kunnen doen, met `security.txt` en een disclosure-beleid | CRA-meldplicht (actief sinds 11 september 2026) |
| 10 | **Externe audit vóór mainnet**, tot die tijd alleen testnet | Je eigen code beoordelen is geen audit |

**Standaarden:** BIP-32/39/44/84, SLIP-44, EIP-155/1559/712, OWASP MASVS v2 (mobiele beveiliging), CCSS (CryptoCurrency Security Standard) als checklist.

**Tip voor de audit als student:** benader een universitaire security-groep (bijv. Radboud Digital Security, TU Delft Cyber Security, TU/e). Een security-review van een open-source wallet is een goed **afstudeer- of onderzoeksproject**. Dat is gratis en het levert een onafhankelijke beoordeling op.

---

## 6. Aansprakelijkheid minimaliseren (in lagen)

| Laag | Maatregel | Effect |
|---|---|---|
| 1. Architectuur | Jij kunt *technisch* niet bij sleutels of geld | Buiten MiCA en Wwft. Je kunt per definitie geen geld van gebruikers "verliezen". |
| 2. Code | Bewezen libraries (Wallet Core native), geen eigen cryptografie, audit, bug bounty | Minder kans op een "gebrekkig product" (PLD) |
| 3. Rechtsvorm | **BV** vanaf fase 1 (ook nodig voor Apple) | Je privévermogen is afgeschermd |
| 4. Verzekering | Bedrijfsaansprakelijkheid plus cyberverzekering. Vraag specifiek naar uitsluitingen voor crypto. | Restrisico afgedekt |
| 5. Contract | Voorwaarden en disclaimer (redelijk, dus niet "nooit aansprakelijk"), privacyverklaring, partnercontracten waarin de partner de financiële dienst levert | Duidelijkheid en een beperkt (niet nul) risico |
| 6. Processen | CRA-meldprocedure, versiebeheer, incidentdraaiboek | Je voldoet aan de wet, en dat helpt bij een claim |
| 7. Communicatie | Geen beloftes over veiligheid of rendement | Geen claims op basis van misleiding |

---

## 7. Kosten

| Post | Fase 0 (web-tool) | Fase 1 (Android) | Fase 2 (iOS) |
|---|---|---|---|
| KvK-inschrijving eenmanszaak | ~€85 | — | — |
| BV-oprichting (online notaris) | — | — | ~€300–800 |
| Domeinnaam | ~€10–15 per jaar | | |
| Hosting (Cloudflare Pages) | €0 | €0 | €0 |
| Google Play-account | — | $25 eenmalig | |
| Apple Developer (organisatie) | — | — | $99 per jaar |
| RPC en koersdata | €0 (free tiers) | €0–50 per maand bij groei | |
| Juridische check (1–2 uur) | — | ~€250–600 | |
| Audit | — | €0 (universiteit) tot €10.000+ | |
| Verzekering | — | — | ~€500–1.500 per jaar |

---

## 8. Roadmap naast je studie (ongeveer 8–10 uur per week)

| Periode | Mijlpaal |
|---|---|
| Maand 1 | KvK, naam en merk check, Box 3/OWR-rekenlogica plus tests (Claude) |
| Maand 2 | Web-tool live, premium-PDF, eerste 100 gebruikers via Reddit (r/BEFire, r/cryptocurrency NL), Tweakers en studenten |
| Maand 3 | B2B-pilot met 2–3 boekhouders. Aanvraag bij een ramp-partner. |
| Maand 4–6 | Android-wallet op testnet, contact met een universiteit voor de review |
| Maand 6–7 | Juridische check, mainnet-launch op Android en F-Droid, ramp live |
| Maand 8+ | Bij voldoende omzet: BV, iOS, swaps via partner |

**Tijdkritisch:** de aangifteperiode voor de inkomstenbelasting loopt van **1 maart tot 1 mei**. Zorg dat de Box 3-tool vóór februari 2027 live staat.

---

## 9. Wie doet wat

| Claude kan | Jij of een derde moet |
|---|---|
| Alle app- en webcode, de Box 3/OWR-berekeningen met tests, de native Wallet Core-module, UI, landingspagina | KvK, BV, accounts bij Apple, Google, partners en RPC-providers aanmaken |
| Concepten voor voorwaarden, privacyverklaring, `security.txt` en CRA-procedure | Juridische eindtoets ⚖️ |
| Threat model, CCSS/MASVS-checklist, SBOM-pipeline | **Onafhankelijke** audit (Claude kan zijn eigen code niet onafhankelijk controleren) |
| Marketingteksten, SEO, contentkalender | Fiscale controle van de OWR-rekenregels door een belastingadviseur |

---

## 10. Bronnen

### Academisch
1. Erinle, Y., Kethepalli, Y., Feng, Y. & Xu, J. (2025). *SoK: Design, Vulnerabilities, and Security Measures of Cryptocurrency Wallets.* Computer Networks 273, 111691. [arXiv:2307.12874](https://arxiv.org/abs/2307.12874)
2. Karantias, K. (2020). *SoK: A Taxonomy of Cryptocurrency Wallets.* [IACR ePrint 2020/868](https://eprint.iacr.org/2020/868)
3. Houy, S., Schmid, P. & Bartel, A. (2023). *Security Aspects of Cryptocurrency Wallets: A Systematic Literature Review.* ACM Computing Surveys 56(1).
4. Voskobojnikov, A., Wiese, O., Mehrabi Koushki, M., Roth, V. & Beznosov, K. (2021). *The U in Crypto Stands for Usable: An Empirical Study of User Experience with Mobile Cryptocurrency Wallets.* CHI '21.
5. Eskandari, S., Barrera, D., Stobert, E. & Clark, J. (2015). *A First Look at the Usability of Bitcoin Key Management.* USEC 2015.
6. Krombholz, K., Judmayer, A., Gusenbauer, M. & Weippl, E. (2016). *The Other Side of the Coin: User Experiences with Bitcoin Security and Privacy.* Financial Cryptography 2016.
7. Mai, A., Pfeffer, K., Gusenbauer, M., Weippl, E. & Krombholz, K. (2020). *User Mental Models of Cryptocurrency Systems: A Grounded Theory Approach.* SOUPS 2020.
8. Bonneau, J. e.a. (2015). *SoK: Research Perspectives and Challenges for Bitcoin and Cryptocurrencies.* IEEE S&P 2015.
9. Zetzsche, D., Buckley, R. & Arner, D. (2018). *The Distributed Liability of Distributed Ledgers: Legal Risks of Blockchain.* University of Illinois Law Review 2018(4).
10. Zetzsche, D., Annunziata, F., Arner, D. & Buckley, R. (2021). *The Markets in Crypto-Assets Regulation (MiCA) and the EU Digital Finance Strategy.* Capital Markets Law Journal 16(2).
11. Haentjens, M., de Graaf, T. & Kokorin, I. (2020). *The Failed Hopes of Disintermediation: Crypto-Custodian Insolvency, Legal Risks and How to Avoid Them.* Singapore Journal of Legal Studies.

*Bron 1 is online geverifieerd. Bronnen 2–11 komen uit vakkennis: controleer DOI en jaartal voordat je ze citeert.*

### Wetgeving
- MiCA: [Verordening (EU) 2023/1114](https://eur-lex.europa.eu/eli/reg/2023/1114/oj), overweging 83 (non-custodial), bijlage IV (kapitaal)
- Travel Rule: [Verordening (EU) 2023/1113](https://eur-lex.europa.eu/eli/reg/2023/1113/oj)
- AMLR: [Verordening (EU) 2024/1624](https://eur-lex.europa.eu/eli/reg/2024/1624/oj)
- Cyber Resilience Act: [Verordening (EU) 2024/2847](https://eur-lex.europa.eu/eli/reg/2024/2847/oj)
- Productaansprakelijkheid: [Richtlijn (EU) 2024/2853](https://eur-lex.europa.eu/eli/dir/2024/2853/oj), NL-implementatie [wetsvoorstel 36 906](https://www.njb.nl/wetgeving/wetsvoorstellen/herziening-productaansprakelijkheid/)
- CRA-meldplicht vanaf 11 september 2026: [Goodwin](https://www.goodwinlaw.com/en/insights/publications/2026/09/alerts-lifesciences-technology-preparing-for-eu-cyber-resilience-act), [Matheson](https://www.matheson.com/insights/the-eu-cyber-resilience-act-recap-reporting-obligations/)
- DAC8: [PwC](https://www.pwc.nl/nl/actueel-en-publicaties/belastingnieuws/overig/crypto-aanbieders-vanaf-2026-verplicht-om-gegevens-te-delen.html)
- Crypto in Box 3: [Grant Thornton](https://www.grantthornton.nl/insights/tax/box-3/crypto-in-box-3-actuele-regels-en-aandachtspunten/)

### Technisch en praktisch
- [Trust Wallet Core-documentatie](https://developer.trustwallet.com/wallet-core) (Apache-2.0)
- [TrustConnect SDK-aankondiging](https://trustwallet.com/blog/announcements/introducing-trust-connect-sdk-the-free-open-source-wallet-connection-library-for-every-chain-by-trust-wallet)
- [Gem Wallet op F-Droid](https://f-droid.org/de/packages/com.gemwallet.android/) (GPL-3.0)
- [Ledger Donjon: kwetsbaarheid in de Trust Wallet-extensie](https://www.ledger.com/blog/funds-of-every-wallet-created-with-the-trust-wallet-browser-extension-could-have-been-stolen), [CVE-2023-31290](https://www.opencve.io/cve/CVE-2023-31290)
- [Google Play: non-custodial wallets uitgezonderd](https://decrypt.co/335134/google-non-custodial-wallets-exempt-new-crypto-app-rules-play-store)
- [Apple 3.1.5: wallets alleen via organisatie-account](https://conductatlas.com/platform/apple/apple-app-store-review-guidelines/provision/CA-P-018935/crypto-wallet-apps-require-organization-developer-enrollment/) (controleer de actuele [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/))
