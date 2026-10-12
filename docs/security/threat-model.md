# Dreigingsmodel

*Bijgewerkt: 2026-10-12 · methode: assets → aanvallers → STRIDE → maatregelen → restrisico*

## 1. Wat beschermen we

| Asset | Waarde | Waar het staat |
|---|---|---|
| **Crypto van de klant** | Zeer hoog (doelgroep: grote vermogens) | On-chain, multisig; sleutels op hardware wallets van de klant |
| Kluismetadata: adressen, saldi, transacties | Hoog (verraadt vermogen → doelwit voor afpersing) | Alleen als ciphertext op onze server |
| Wie is lid van welke organisatie, rollen | Middel | Plaintext in onze database |
| Integriteit van het auditlog | Hoog (bewijs) | Database, hash-keten |
| Beschikbaarheid van de coördinatie | Middel (geld blijft bereikbaar zonder ons) | API + database |

## 2. Aanvallers

| Aanvaller | Doel | Middelen |
|---|---|---|
| Externe hacker | Geld stelen, data verkopen | Phishing, kwetsbaarheden, credential stuffing |
| Gerichte aanvaller op een vermogende klant | Geld via dwang of misleiding | Social engineering, malware, fysieke dwang |
| Kwaadwillende insider (bij ons) | Geld of data | Toegang tot servers en database |
| Gecompromitteerde leverancier | Code injecteren | Een npm-pakket, GitHub Action of hostingpartij |
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
| | Transactie-inhoud wijzigen | PSBT ondertekend op de hardware wallet; gebruiker controleert het scherm van het apparaat | ⏳ client |
| | Kwaadaardige code via onze webserver | Strikte CSP, geen sleutels in de browser, hardware wallet als laatste controle | ✅ / ⏳ |
| **R**epudiation | "Ik heb dat niet goedgekeurd" | Auditlog per actie in dezelfde transactie; step-up met passkey per beslissing | ✅ |
| **I**nformation disclosure | Datalek van onze database | Zero-knowledge: alleen ciphertext voor kluisgegevens | ✅ server / ⏳ client |
| | IDOR: andere organisatie bekijken | Centrale autorisatie; 404 voor niet-leden (getest) | ✅ |
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
| Phishing gericht op bestuurders | Passkeys; nooit sleutels of herstelzinnen invoeren in onze app (alleen hardware wallets) |

## 5. Supply chain en eigen organisatie

| Maatregel | Status |
|---|---|
| Minimale dependencies, lockfile, npm install-scripts standaard geblokkeerd (`allow-scripts`) | ✅ |
| Dagelijkse scan (OSV + CISA KEV), Dependabot | ✅ |
| SBOM per build | ✅ |
| GitHub: 2FA met passkey, branch protection, verplichte CI, signed commits | ⏳ inrichten (zie runbook) |
| GitHub Actions vastpinnen op commit-SHA; `--ignore-scripts`; rechten per job | ✅ |
| Secrets alleen in een secret manager, nooit in de repo; secret scanning aan | ⏳ |
| Externe pentest en cryptografische review vóór livegang | ⏳ |
| Bug bounty / CVD-beleid | ✅ beleid, ⏳ programma |

## 6. Restrisico's (bewust geaccepteerd of open)

1. Metadata (lidmaatschap, drempel, tijdstippen) is zichtbaar voor ons en dus bij een lek.
2. Bij volledige databasetoegang kan een aanvaller de auditketen herschrijven, zolang er geen externe verankering is (ADR-0006).
3. De client-side versleuteling bestaat nog niet. Tot die tijd is "zero-knowledge" alleen een eigenschap van de server-API, niet van het product.
4. Rate limiting in geheugen werkt alleen met één instantie.

**Over "de veiligste crypto-app van Nederland":** dat kunnen en mogen we niet claimen (misleidende reclame). We kunnen het wel aantoonbaar maken: open broncode, een openbaar pentestrapport, een cryptografische review, en dit dreigingsmodel met elke maatregel getest in CI.
