# Changelog

Alle noemenswaardige wijzigingen. Formaat: [Keep a Changelog](https://keepachangelog.com/nl/1.1.0/), versies volgens SemVer.

## [Onvoltooid]

### Toegevoegd (2026-10-14, abonnement)
- **Abonnement op het Box 3-aangifterapport via Stripe** (ADR-0016), €35 per jaar. De rekenhulp en "Afdrukken als PDF" blijven gratis.
  - Het rapport is een CSV met de peildatumwaarden, het overige vermogen, de uitkomst en alle transacties in euro's. Het wordt in de browser gemaakt (`box3ReportCsv`), met decimale komma voor Excel NL en bescherming tegen CSV-injectie.
  - API:
    - `GET /v1/billing`, `POST /v1/billing/checkout` (Stripe Checkout) en `POST /v1/billing/portal` (klantportaal);
    - `POST /v1/billing/webhook` met handtekeningcontrole via de officiële SDK, idempotent, en de status altijd vers opgehaald bij Stripe.
  - Opslag zonder persoonsgegevens: alleen Stripe-ID's en status (migratie `0003_billing.sql`).
  - Config faalt dicht: geen live sleutel buiten productie, geen testsleutel in productie, alle drie de variabelen samen. Doorsturen alleen naar `checkout.stripe.com` en `billing.stripe.com`.
  - Nieuwe dependency `stripe` 22.6.2 (MIT, geen dependencies).
  - Nieuwe control CONS-3 (juridische toets vóór activeren, o.a. art. 7:236 BW). Runbook `docs/runbooks/stripe-testen.md`. Privacyverklaring en voorwaarden (concept) bijgewerkt.
  - **Na de reviews** ([QA](docs/qa/2026-10-14-abonnement.md)):
    - geen dubbel abonnement (lokale en live controle bij Stripe);
    - webhook onder een lock per abonnement (race getest op echte PostgreSQL);
    - herstel via `POST /v1/billing/sync`;
    - premium alleen bij onze prijs en een lopende periode;
    - prijs in de UI komt van Stripe;
    - geen gebruikers-ID meer naar Stripe;
    - `rk_live_` verplicht in productie;
    - eigen rate-limit voor de webhook;
    - printweergave van het rapport (betaald) en waarschuwingen, eindkoersen en crypto-totaal in het rapport;
    - terugkeer van Stripe opent het Box 3-tabblad;
    - eerlijkere copy over opzeggen en herroepen.

### Gewijzigd (2026-10-14, supply chain)
- **Dependabot-cooldown van 7 dagen** voor npm, GitHub Actions en de Vercel CLI. De bestaande regel "alleen versies die minstens 7 dagen oud zijn" hangt zo niet meer af van discipline; security-updates komen direct.
- `VERCEL_TELEMETRY_DISABLED=1` in release en noodstop.
- Dependabot-PR's #4 (lucide-react 1.55.0) en #5 (vercel 63.1.2): inhoudelijk schoon, maar jonger dan 7 dagen. Mergen vanaf 17-10 respectievelijk 16-10 ([QA](docs/qa/2026-10-14-dependabot.md)).
- lucide-react 1.17.0 → 1.52.0 (Dependabot #9, na de cooldown in plaats van #4).

### Toegevoegd (2026-10-14, versturen met een Ledger)
- **Bitcoin versturen met een Ledger in de browser, alleen op testnet4** (ADR-0015, stap 2 uit ADR-0012):
  - WebHID met de app "Bitcoin Test". De sleutel blijft op het apparaat; de gebruiker controleert ontvanger, bedrag en vergoeding op het scherm.
  - De browser zoekt het BIP-84-account (gap-limiet 20) en bouwt de PSBT met `@scure/btc-signer`. Hij controleert het plan onafhankelijk (`verifyPlan`) en de vorige transacties (txid en bedrag), verwerkt alleen de handtekeningen van de genoemde sleutels, en zendt rechtstreeks via mempool.space uit. De KERN-server ziet niets en er wordt niets bewaard.
  - Mainnet-adressen, `xpub` en de Ledger-app "Bitcoin" worden geweigerd. Alleen bevestigde UTXO's worden uitgegeven. Eigen afleiding en apparaat worden vergeleken. Er is een waarschuwing tegen lijkende adressen (address poisoning).
  - Een eigen ontvangstadres kun je tonen op het scherm van de Ledger.
  - De Ledger- en transactiecode wordt lui geladen.
- Nieuwe dependencies (motivatie in ADR-0015): `@scure/btc-signer`, `@scure/bip32`, `@noble/curves` (verifiëren), `@ledgerhq/ledger-bitcoin`, `@ledgerhq/hw-transport-webhid`, `buffer`.
- Tests: rekenkern (BIP-84-testvector, invoer, scannen, plan, vorige transacties, handtekeningen, uitzenden), Ledger-koppeling (versies, foutcodes, apparaatkeuze) en de MICA-1-regels.
- Runbook `docs/runbooks/testen.md` §5: testen met een echte Ledger op testnet4.
- **Na de reviews** ([QA](docs/qa/2026-10-14-ledger-versturen.md)):
  - handtekeningen van het apparaat worden geverifieerd en moeten SIGHASH_ALL zijn;
  - vergoeding hooguit 200 sat/vB en absoluut 50.000 sat;
  - scan met plafond, UTXO's gevalideerd en ontdubbeld;
  - uitzenden onderscheidt "geweigerd" van "onzeker" (geen onterecht "niets verstuurd");
  - een adres-mismatch is fataal;
  - geen race bij dubbelklikken;
  - de dialoog houdt de focus vast, heeft een vaste live region en fouten bij het veld, en vangt een mislukte lazy load op;
  - MICA-1 strenger (elke `.sign(` in eigen code verboden) en `alleen-testnet` controleert elk gebruik van `NETWORK`;
  - `npm audit signatures` in CI.

### Gewijzigd (2026-10-14, versturen met een Ledger)
- **CSP met Trusted Types** (`require-trusted-types-for 'script'; trusted-types 'none'`) en `Permissions-Policy: hid=(self)`. Gecontroleerd op de productie-build: geen overtredingen.
- **Control MICA-1 vervangen** door de strengere variant uit ADR-0012:
  - geen herstelzin- of hot-wallet-bibliotheken;
  - geen privésleutel-API's in eigen code;
  - Ledger-code alleen in `lib/ledger.ts`.
- Nieuwe control **MICA-4** (`alleen-testnet`). Het register staat op fase 1. MICA-2 (juridische toets) is verplicht vóór mainnet.
- Privacyverklaring en `third-parties.json`: wat mempool.space ziet bij versturen.
- `withRetry` is generiek (behoudt het type van de fetch-functie).

### Gewijzigd (2026-10-14, GitHub en hosting)
- **GitHub-beveiliging aan** ([runbook](docs/runbooks/github-beveiligen.md)):
  - branch protection op `main` (PR en check `ci` verplicht, ook voor beheerders, lineaire historie, geen force-push);
  - tag-rulesets op `v*`: alleen de beheerder maakt release-tags, niemand verplaatst of verwijdert ze;
  - secret scanning met push protection, Dependabot-securityupdates en private vulnerability reporting;
  - Actions: alleen actions van GitHub, SHA-pinning verplicht.
- **CI:** draait bij een push alleen nog op `main` (plus elke PR), zodat er één check `ci` per PR-commit is. De API-tests hebben een timeout van 30 s, omdat de IDOR-test op PGlite in CI soms langer duurt dan 5 s.
- **CRA-alarm:** security watch maakt eerst het issue en zet het incidentbestand daarna op een branch. De workflow-token maakt geen PR meer, want dat mag niet en zou geen CI starten ([QA](docs/qa/2026-10-14-github-en-hosting.md)).
- **Hosting (ADR-0007, aanvulling):** de API draait in de testfase alleen lokaal in Docker. freevps.edu.pl is onderzocht en afgewezen (anonieme aanbieder, geen verwerkersovereenkomst mogelijk). Gratis alternatieven voor studenten staan in de ADR.

### Toegevoegd (2026-10-14)
- **Geld toevoegen: kopen via een partner met MiCA-vergunning** (ADR-0014). Het gaat om doorverwijzing; KERN komt nooit aan geld of crypto.
  - Standaardpartner is Ramp Network (MiCA-CASP, Ierland), met vooringevuld adres. MoonPay (AFM-CASP) kan ook, maar zonder voorinvulling (zero-knowledge).
  - De link wordt in de browser gemaakt, gevalideerd en geopend met `noopener,noreferrer`.
  - De vergoeding aan KERN wordt duidelijk gemeld. Zonder partnersleutel toont de knop "Nog niet actief".
  - Alleen omzetdeling uit de eigen fee van de partner, zonder opslag voor de gebruiker.
  - Het adres gaat alleen mee als de gebruiker aanvinkt dat hij het zelf beheert; het volledige adres is dan zichtbaar.
  - Een bedrag met komma of punt wordt geweigerd. De knop is een gewone link (geen pop-up) en er gaat geen logo-URL mee.
  - Nieuwe controls MICA-3 (partner in register, passport voor NL, geen opslag) en RECL-2 (vermelding van de vergoeding). Tests in core en web ([QA](docs/qa/2026-10-14-koopknop.md)).
- De web-dev-server draait vast op poort 5188, zodat de API de origin accepteert.
- De repository is openbaar (open broncode, PLAN.md §5.3); daardoor werken build-attestaties.
- Runbook `docs/runbooks/testen.md`: een testaccount (passkey), testadressen en het testen van de koopknop.
- `.env`-bestanden staan in `.gitignore`; `apps/web/.env.example` toegevoegd.

### Gewijzigd (2026-10-14)
- `--muted` naar `#646a66` (WCAG AA), op verzoek van de eigenaar, als overschrijving in `app.css`.

### Gewijzigd
- **Uitloggen wist alleen de sessiecookie** (`Clear-Site-Data: "cookies"`, was ook `"storage"`). Anders verdween bij elke keer uitloggen de adressenlijst; wissen is nu een aparte keuze.
- Compliance COOK-1: `localStorage` alleen in `apps/web/src/lib/storage.ts` (gevolgde adressen en taal; strikt noodzakelijk).
- Privacyverklaring (accountgegevens, lokale opslag, Vercel als host), beveiligingspagina en dreigingsmodel bijgewerkt.
- `engines.node` 24.x. De map `kern-wallet-development-test-ui/` staat in `.gitignore`.
- Na reviewronde 2 ([docs/qa/2026-10-13-web-wallet.md](docs/qa/2026-10-13-web-wallet.md)):
  - **Deploy-keten:**
    - geen Git-deploys meer op Vercel;
    - de release attesteert de artefacten, de deploy draait in een aparte job zonder repo-dependencies en controleert de attestatie;
    - deployen gaat eerst als preview, dan de rooktest, dan promotie;
    - de noodstop deployt alleen een geattesteerde release met scripts van dezelfde tag;
    - een release weigert een actieve noodstop stil op te heffen;
    - `pipefail` in de release;
    - de Vercel CLI is vastgepind in een eigen lockfile (62.4.0, `--ignore-scripts`);
    - er is een eigen `404.html`.
  - **Sessie:** uitloggen na 30 minuten inactiviteit en sessiecontrole elke minuut in de client; "uitgelogd" alleen na bevestiging van de server.
  - **Data:** fouten per adres geïsoleerd; geschiedenis en koersen gecachet; een verzending met wisselgeld naar een eigen adres heet nu een verzending (fee-grens per asset, getest).
  - **Eerlijkheid en veiligheid:**
    - Ontvangen toont het volledige adres in blokjes, met de waarschuwing "alleen als dit adres van jou is";
    - opgeslagen adressen worden met checksum gevalideerd;
    - de herkenning van herstelzinnen werkt ook met komma's, nummering, andere talen en `[uvYZ]prv`, ook in de box 3-rekenhulp;
    - claims over ondertekenen en sleutels zijn herschreven naar feiten.
  - **Toegankelijkheid en UX:**
    - de dialoog houdt de focus vast en verspringt niet;
    - het profielmenu sluit met Escape en een klik erbuiten;
    - raakvlakken zijn minimaal 44px en invoervelden hebben genoeg contrast;
    - laadstaat met "—" in plaats van €0;
    - "t.o.v. gisteren" in plaats van "vandaag";
    - foutstaten in het beveiligingscentrum;
    - taalknop en terugknop op mobiel;
    - enkelvoud en meervoud in de teksten.
  - De passkey-prompt toont "KERN" (`RP_NAME`). Bij een ontbrekende API zegt de app "server niet bereikbaar" in plaats van "HTTP 404".
- Na verificatieronde 3:
  - **Deploy:** productie-build zonder domein, rooktest, dan direct promoveren (geen herbouw); de rooktest wacht met retries.
  - **Herkomst:** `scripts/verify-release.sh` controleert tag op main, `github-actions[bot]` als uploader en de attestatie van `release.yml` en precies deze tag. Bij een privé-repo is attestatie uit te zetten met `ATTESTATION=off`.
  - **Vertrouwde code:** scripts komen altijd van main; `concurrency` tussen release en noodstop; Dependabot voor de CLI.
  - **API:** `GET` met `x-kern-session-check: 1` verlengt de sessie niet. De web-app controleert daarmee op de achtergrond, en alleen een 401 logt uit.
  - **Geheimen:** de rekenhulp toont geen sleutelfragmenten meer en wist bij twijfel.

### Toegevoegd
- **KERN web-wallet (alleen-lezen)** (ADR-0013): het v0-ontwerp van de eigenaar (landing en dashboard), 1-op-1 overgenomen, gekoppeld aan de backend en de rekenkern:
  - "Maak je wallet" en "Open wallet": passkey-registratie en -login via de API. Het beveiligingscentrum toont je passkeys en kan andere sessies uitloggen.
  - Adressen volgen (BTC, ETH): totaal saldo in EUR, dagwijziging, waardeverloop (1W/1M/1Y/ALL), bezittingen en transactiegeschiedenis met echte data.
  - Ontvangen met QR-code en uitgelicht begin en eind van het adres. Versturen legt eerlijk uit dat dit op het web alleen met een hardware wallet kan (in ontwikkeling).
  - Box 3-rekenhulp als tabblad, met de adressen uit de wallet.
  - Werkende NL/EN-knop. Mobiele tabbalk, omdat de navigatie in het v0-ontwerp op mobiel verdween.
  - Waarschuwing en wissen bij een geplakte herstelzin of privésleutel.
  - Uitloggen, of uitloggen en dit apparaat wissen.
- `packages/core`: portfoliomodule (saldo per asset, waarde, dagwijziging, waardeverloop, samengevoegde activiteit) met tests.
- **Hosting op Vercel** (ADR-0011): `vercel.json` met dezelfde headers als `_headers`. Productie alleen via `release.yml` (gehasht artefact, `vercel deploy --prebuilt`, rooktest op headers). Noodstop ook voor Vercel. Check CRA-7 (`headers-gelijk`) is streng: geen verwijderregels, geen dubbele of voorwaardelijke regels, geen `routes`/`rewrites`, CSP alleen op `/*`, en auto-deploy van `main` moet uit staan. Runbook `docs/runbooks/vercel-deploy.md`.
- ADR-0010 (naam KERN), ADR-0012 (sleutels per platform: nooit op het web; Bitcoin en EVM; app via Wallet Core native; mainnet pas na audit), ADR-0013 (web-wallet).
- Tests voor `apps/web` (herkenning van geheimen, opslagvalidatie, volledigheid van de vertalingen, opmaak) en voor de compliance-scripts. Copy-lint weigert ook "veiligste", "unhackable" en vergelijkbare claims. De trackercheck herkent Vercel Analytics.
- Reviewer-agent `design-reviewer`.
- **Backend (`apps/api`)**: PostgreSQL-schema met constraints en append-only auditlog; REST API `/v1` met OpenAPI 3.1; passkey-authenticatie (WebAuthn) met gehashte sessietokens; organisaties, rollen (eigenaar/goedkeurder/alleen-lezen), eenmalige uitnodigingen; multisig-kluizen en goedkeuringsworkflow (M-van-N) met alleen client-side ciphertext; manipulatiebestendig auditlog (hash-keten); rate limiting, CSRF-origincontrole, beveiligingsheaders, body limit.
- **Beveiliging na onafhankelijke review** ([docs/qa/2026-10-12-backend.md](docs/qa/2026-10-12-backend.md), ADR-0009):
  - ondertekenaars per kluis met gewogen goedkeuringen (solo-ondernemer met meerdere sleutels werkt);
  - step-up: verse passkey-bevestiging gebonden aan één actie;
  - uitnodigingen geven nooit eigenaarschap, zijn intrekbaar, en nieuwe leden blijven *pending* tot bevestiging met een veiligheidscode;
  - passkey- en sessiebeheer, kloondetectie vóór verificatie, opruimen van challenges;
  - endpoints voor E2EE-sleuteldistributie;
  - strikte base64, fail-closed configuratie, TRUNCATE-blokkade op het auditlog, migratielock.
- Verificatieronde door een tweede onafhankelijke reviewer verwerkt: step-up ook voor annuleren, intrekken en encryptiesleutel; productie migreert niet bij start (least privilege); stemmen van verwijderde leden vervallen; kloondetectie pas na geverifieerde handtekening; security-watch gesplitst in een alleen-lezen-scan en een rapport-job.
- 57 API-tests, ook draaibaar tegen echte PostgreSQL (`TEST_DATABASE_URL`, standaard in CI).
- Commit-hook en CI-check: geen AI-assistent als (co-)auteur in commits.
- CI: alle workspaces getest, Postgres-service, actions op commit-SHA, `--ignore-scripts`, rechten per job, release via beschermde environment, documentatie-check op PR's.
- Documentatiestructuur: `docs/` (architectuur, 9 ADR's, dreigingsmodel, API, runbooks, QA-rapporten), `CLAUDE.md`, reviewer-agents in `.claude/agents/`.
- Positionering op ondernemers met grote vermogens (ADR-0008, `docs/product/zakelijk.md`).
- `docker-compose.yml` voor lokale PostgreSQL.

### Opgelost
- Testschema's bleven achter bij tests tegen echte PostgreSQL; ze worden nu na elk testbestand verwijderd (verbindingen worden ook bij fouten gesloten).
- Auditlog gaf vanaf de tiende regel een dubbel volgnummer uit (tekstsortering van `seq`). Gevonden door tests; er staat nu een regressietest.

## [0.1.0] - 2026-10-12

### Toegevoegd
- Box 3-rekenhulp (web): werkelijk rendement versus forfaitair voor BTC en ETH, volledig in de browser.
- Compliance-systeem: register met 14 wetten, automatische checks, CRA-incidentklok, kwetsbaarhedenscan (OSV + CISA KEV), noodstop, bewijsbundel per release.
