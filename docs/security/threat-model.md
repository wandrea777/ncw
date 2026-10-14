# Dreigingsmodel

*Bijgewerkt: 2026-10-13 (web-wallet alleen-lezen, Vercel, sleutels per platform) · methode: assets → aanvallers → STRIDE → maatregelen → restrisico*

## 1. Wat beschermen we

| Asset | Waarde | Waar het staat |
|---|---|---|
| **Crypto van de klant** | Zeer hoog (doelgroep: grote vermogens) | On-chain, multisig; sleutels op hardware wallets van de klant |
| Kluismetadata: adressen, saldi, transacties | Hoog (verraadt vermogen → doelwit voor afpersing) | Alleen als ciphertext op onze server |
| Wie is lid van welke organisatie, rollen | Middel | Plaintext in onze database |
| Integriteit van het auditlog | Hoog (bewijs) | Database, hash-keten |
| Beschikbaarheid van de coördinatie | Middel (geld blijft bereikbaar zonder ons) | API + database |
| Gevolgde adressen in de web-wallet | Hoog (koppelt een persoon aan een vermogen) | Alleen in de browser van de gebruiker (`localStorage`), nooit op onze server (ADR-0013) |
| Accountgegevens: naam, passkeys, sessies | Middel | Database (publieke sleutels, gehashte sessietokens) |
| Integriteit van de uitgeleverde web-code | Zeer hoog zodra er ondertekend wordt (hardware wallet) | Vercel (ADR-0011) |

## 2. Aanvallers

| Aanvaller | Doel | Middelen |
|---|---|---|
| Externe hacker | Geld stelen, data verkopen | Phishing, kwetsbaarheden, credential stuffing |
| Gerichte aanvaller op een vermogende klant | Geld via dwang of misleiding | Social engineering, malware, fysieke dwang |
| Kwaadwillende insider (bij ons) | Geld of data | Toegang tot servers en database |
| Gecompromitteerde leverancier | Code injecteren | Een npm-pakket, GitHub Action of hostingpartij (Vercel-account, Vercel GitHub-app) |
| Iemand met toegang tot het apparaat | Zien welke adressen iemand volgt | Gedeelde computer, malware |
| Overheid of derde met vordering | Gegevens opvragen | Juridische middelen |

## 3. STRIDE per onderdeel

| Dreiging | Voorbeeld | Maatregel | Status |
|---|---|---|---|
| **S**poofing | Inloggen als bestuurder | Passkeys met user verification; phishingbestendig | ✅ |
| | Gestolen sessiecookie | HttpOnly, Secure, SameSite=Strict, `__Host-`; korte levensduur; hash in DB | ✅ |
| | Gekloonde authenticator | Detectie van teruglopende teller vóór verificatie, atomaire update | ✅ |
| | Onderschepte uitnodigingscode | Nooit eigenaarschap; pending tot bevestiging met veiligheidscode; intrekbaar | ✅ |
| | Gestolen sessie voert gevoelige actie uit | Step-up: verse passkey per actie (target-gebonden) voor alle wijzigende beheer- en goedkeuringsacties; lezen en voorstellen indienen kan wel met alleen een sessie | ✅ |
| **T**ampering | Goedkeuring vervalsen in de DB | On-chain multisig is de echte controle; auditketen detecteert wijzigingen | ✅ / ⏳ verankering |
| | Transactie-inhoud wijzigen | PSBT ondertekend op de hardware wallet; gebruiker controleert het scherm van het apparaat. Web (Ledger, testnet): `verifyPlan` controleert vóór ondertekenen uitvoer, bedrag, wisselgeld en vergoeding; vorige transacties worden tegen txid en bedrag gecontroleerd (ADR-0015) | ✅ web testnet / ⏳ kluis |
| | Kwaadaardige code via onze webserver | Strikte CSP met Trusted Types, `hid=(self)`, geen sleutels in de browser (check MICA-1), hardware wallet als laatste controle; Ledger-code lui geladen | ✅ |
| | Overname van het Vercel-account of de GitHub-app | Passkey/2FA op Vercel; geen Git-deploys (CRA-7); productie en noodstop alleen met een **geattesteerd** artefact, eerst als preview, rooktest, dan promoveren; deploy-job zonder repo-dependencies | ✅ config / ⏳ account inrichten |
| | Geknoeid release-artefact of kwaadaardige tag via de noodstop | `verify-release.sh`: de tag staat op main, de release en het asset komen van `github-actions[bot]`, en de attestatie hoort bij precies `release.yml` en deze tag. Scripts komen altijd van main, nooit van de tag | ✅ (attestatie ⏳ zolang de repo privé is) |
| | Periodieke controle houdt de sessie eeuwig levend | De controle stuurt `x-kern-session-check: 1` en verlengt de inactiviteitstermijn op de server niet (getest) | ✅ |
| | Sessie blijft open op een gedeeld apparaat | Uitloggen pas tonen na bevestiging van de server; uitloggen na 30 minuten inactiviteit in de client; sessie-check elke minuut | ✅ (getest) |
| | Preview-deployment van een branch gebruikt voor phishing | Deployment Protection (Standard) op previews en gegenereerde URL's; Fork Protection aan | ⏳ inrichten |
| | Kwaadaardige mobiele app-update (straks) | Geen OTA-updates; signeersleutels en store-accounts met hardware-2FA; gefaseerde uitrol; reproduceerbare builds (ADR-0012) | ⏳ fase app |
| | Blind ondertekenen van EVM-contractcalls (permits, approvals) via hardware wallet | Alleen clear-signing; in de MVP alleen gewone transfers; approvals tonen en waarschuwen (ADR-0012) | ⏳ fase hardware wallet |
| | Address poisoning / verkeerd ontvangstadres | Ontvangen toont het volledige adres in blokjes van 4, met de waarschuwing "alleen als dit adres van jou is"; opgeslagen adressen worden bij inlezen opnieuw met checksum gevalideerd; Versturen waarschuwt bij een adres dat aan begin en eind lijkt op een eigen of gevolgd adres; eigen ontvangstadres te tonen op het scherm van de Ledger (ADR-0015) | ✅ web |
| | Koopknop stuurt naar een vervalste partner of een verkeerd adres | Alleen vaste partnerhosts in de code (getest met een expliciete lijst). Adres alleen na "beheer ik zelf", volledig getoond, met checksum en de juiste munt. Een ongeldig bedrag geeft geen link. Een onbekende `VITE_ONRAMP_ENV` laat de build falen (ADR-0014) | ✅ |
| | Gemanipuleerde build-configuratie (andere partnersleutel) | Vereist toegang tot de build of het Vercel-account; productie alleen via `release.yml` met gecontroleerde herkomst. Gevolg is hooguit een omgeleide commissie, geen geldverlies | ✅ / restrisico |
| **R**epudiation | "Ik heb dat niet goedgekeurd" | Auditlog per actie in dezelfde transactie; step-up met passkey per beslissing | ✅ |
| **I**nformation disclosure | Datalek van onze database | Zero-knowledge: alleen ciphertext voor kluisgegevens | ✅ server / ⏳ client |
| | IDOR: andere organisatie bekijken | Centrale autorisatie; 404 voor niet-leden (getest) | ✅ |
| | Gevolgde adressen uitlekken | Niet naar onze server; alleen naar de chainbronnen in de privacyverklaring (CSP); "Uitloggen en dit apparaat wissen"; data uit opslag wordt gevalideerd | ✅ |
| | Herstelzin per ongeluk geplakt | Herkenning van herstelzin, WIF, ruwe sleutel en xprv: waarschuwen, invoer wissen, niets opslaan of versturen (getest) | ✅ |
| | Lekken via logs of foutmeldingen | Geen IP, body of query in logs; generieke fouten; invoer wordt niet geëchood (getest) | ✅ |
| **D**enial of service | API overbelasten | Rate limiting, body limit (256 KB) | ✅ (één instantie) |
| | Wij gaan failliet of offline | Klant houdt toegang via hardware wallets + descriptor-back-up | ⏳ exit-pad |
| **E**levation of privilege | Goedkeurder maakt zichzelf eigenaar | Alleen eigenaren wijzigen rollen; laatste eigenaar beschermd (getest) | ✅ |
| | Race bij gelijktijdig goedkeuren | Rij-lock; rol opnieuw gecontroleerd binnen de transactie (getest, ook op echte PostgreSQL in CI) | ✅ |
| | Quorum faken met nep-accounts | Ondertekenaars vast per kluis; alleen hun stemmen tellen, gewogen per sleutel | ✅ |
| | Eén eigenaar zet andere eigenaren buitenspel | Laatste eigenaar beschermd; step-up; auditlog. Quorum voor eigenaarswijzigingen | ⏳ |

## 4. Specifiek voor vermogende klanten

| Risico | Maatregel |
|---|---|
| Fysieke dwang ("$5 wrench attack") | Multisig met sleutels op verschillende locaties en personen; optioneel tijdslot op grote uitgaven (on-chain) |
| Overlijden of vertrek van een bestuurder | M-van-N met reserve-ondertekenaar (notaris/advocaat); procedure in onboarding |
| Doelwit worden door een datalek | Zero-knowledge; geen saldi of adressen bij ons |
| Phishing gericht op bestuurders | Passkeys; nooit sleutels of herstelzinnen invoeren op het web of in de kluis (alleen hardware wallets). De latere mobiele hot wallet (ADR-0012) is bedoeld voor kleinere bedragen, niet voor de kluis |

## 5. Supply chain en eigen organisatie

| Maatregel | Status |
|---|---|
| Minimale dependencies, lockfile, npm install-scripts standaard geblokkeerd (`allow-scripts`) | ✅ |
| Dagelijkse scan (OSV + CISA KEV), Dependabot | ✅ |
| SBOM per build | ✅ |
| GitHub: branch protection, verplichte CI, tag-rulesets, alleen GitHub-actions met SHA-pin | ✅ (14-10-2026, [runbook](../runbooks/github-beveiligen.md)) |
| GitHub: 2FA met passkey, signed commits | ⏳ eigenaar |
| GitHub Actions vastpinnen op commit-SHA; `--ignore-scripts`; rechten per job | ✅ |
| Secret scanning en push protection aan | ✅ |
| Secrets alleen op environment-niveau (`production`, `noodstop`) met reviewer en branch policy | ⏳ environments nog aanmaken |
| Externe pentest en cryptografische review vóór livegang | ⏳ |
| Bug bounty / CVD-beleid | ✅ beleid, ⏳ programma |

## 6. Restrisico's (bewust geaccepteerd of open)

1. Metadata (lidmaatschap, drempel, tijdstippen) is zichtbaar voor ons en dus bij een lek.
2. Bij volledige databasetoegang kan een aanvaller de auditketen herschrijven, zolang er geen externe verankering is (ADR-0006).
3. De client-side versleuteling bestaat nog niet. Tot die tijd is "zero-knowledge" alleen een eigenschap van de server-API, niet van het product.
4. Rate limiting in geheugen werkt alleen met één instantie.
5. De API draait nog niet in productie. Op Vercel werkt inloggen pas als de API op dezelfde origin bereikbaar is (ADR-0013).
6. Wie het apparaat van de gebruiker kan inzien, ziet de gevolgde adressen (bewust: geen server-opslag). Versleutelde synchronisatie volgt pas met de client-cryptografie van ADR-0004. Een browserextensie of XSS kan ze lezen en via de toegestane chainbronnen naar buiten sturen.
7. De chainbronnen (mempool.space, Blockscout) zien alle gevolgde adressen in korte tijd vanaf hetzelfde IP-adres, en kunnen ze dus aan één persoon koppelen. Dat staat in de privacyverklaring. Een eigen node of een privacy-proxy is een latere optie.
8. De noodstop werkt in de client (`status.json`). Hij stopt geen gecompromitteerde JavaScript; daarvoor is een nieuwe deploy nodig (de release-workflow met een geattesteerd artefact).
9. Meerdere tabbladen: na "Uitloggen en dit apparaat wissen" kan een ander open tabblad de lijst opnieuw wegschrijven. Laag risico; later oplossen met een `storage`-event.
10. `VERCEL_TOKEN` geeft toegang tot het hele Vercel-team. Beperk de scope, zet een vervaldatum en bewaar de token alleen in de environments `production` en `noodstop`, met branch-policy "alleen main en tags".
11. De Vercel CLI heeft bekende kwetsbaarheden in zijn dependencies (zie ADR-0011). Hij draait alleen in CI op ons eigen geattesteerde artefact.

**Over "de veiligste crypto-app van Nederland":** dat kunnen en mogen we niet claimen (misleidende reclame). We kunnen het wel aantoonbaar maken: open broncode, een openbaar pentestrapport, een cryptografische review, en dit dreigingsmodel met elke maatregel getest in CI.
