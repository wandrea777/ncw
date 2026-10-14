# QA: Versturen met een Ledger (Bitcoin testnet4)

- **Datum:** 2026-10-14 · **Branch:** `ledger-btc-testnet` · gereviewd: commit `49d513c`
- **Reviewers (onafhankelijk):** qa-reviewer, security-reviewer, design-reviewer
- **Opdracht van de eigenaar (letterlijk):** *"Versturen via een hardware wallet: niet aan begonnen. Ik ga ervan uit dat je met “ja” eerst een hardware wallet in de browser bedoelt (Ledger/Trezor, testnet), vóór de mobiele app."* Op de vraag "Met welke hardware wallet beginnen we op het web (eerst Bitcoin, alleen testnet)?" koos de eigenaar: *"Ledger eerst (Aanbevolen)"*.

## Bevindingen → besluit → fix

| # | Bron | Ernst | Bevinding | Besluit | Fix / reden |
|---|---|---|---|---|---|
| 1 | QA | Hoog | Nooit getest met een echte Ledger | **Open, ligt bij de eigenaar** | Kan alleen met het apparaat. Runbook `testen.md` §5. Vóór de eerstvolgende release-tag uitvoeren en de testnet4-txid hier vastleggen. Mergen naar `main` deployt niets (release gaat via tags). |
| 2 | Design | Hoog | De focus verdwijnt uit de dialoog bij elke stapwissel | Opgelost | Elke stap staat in een `.dialog-step` met `tabIndex=-1` die de focus krijgt. In de browser gecontroleerd. |
| 3 | Design | Hoog | `.dialog p` wint van `.form-error`, waardoor fouten eruitzien als gewone tekst | Opgelost | `.dialog .form-error`. In de browser gecontroleerd (rood `#8a2d20`). |
| 4 | Design, Security | Hoog | Na een adres-mismatch kon je met "Opnieuw proberen" toch door | Opgelost | `account-invalid` is fataal: sessie en state worden gewist, er is geen knop "opnieuw", wel een link naar de beveiligingspagina. |
| 5 | Design | Hoog | "Er is niets verstuurd" klopt niet bij een fout tijdens het uitzenden | Opgelost | `broadcast` onderscheidt `broadcast-rejected` (4xx, zeker niet verstuurd) van `broadcast-uncertain` (netwerkfout, 5xx, ander ID). Na ondertekenen is elke onverwachte fout onzeker. De UI linkt naar mempool.space en biedt niet opnieuw versturen aan. Getest. |
| 6 | Security | Laag (hoog bij mainnet) | `finalizeSigned` controleert sighash noch handtekening | Opgelost | ECDSA-verificatie tegen de BIP-143-sighash met `@noble/curves`, en SIGHASH_ALL is verplicht. Tests: omgedraaide bit, verwisselde invoer, NONE\|ANYONECANPAY. |
| 7 | Security | Middel | Fee-aanval via een liegende fee-API (grens 1000 sat/vB, geen absolute grens) | Opgelost | Hooguit 200 sat/vB en absoluut hooguit 50.000 sat (`fee-too-high`), met grenswaardetests. Een tweede bron volgt vóór mainnet (ADR-0015). |
| 8 | QA | Middel | De test van de fee-aanval slaagde om de verkeerde reden (andere txid) | Opgelost | Nieuwe test: de API liegt over het bedrag van een echte UTXO (dezelfde txid). De controle op bedrag en script vangt dat. |
| 9 | QA, Security | Middel | Race: een dubbelklik op "Onderteken" of "Terug" tijdens het ophalen | Opgelost | Synchrone `busyRef` vóór de eerste `await`; "Terug" en "Onderteken" staan uit zolang er iets loopt; er wordt gecontroleerd dat het herbouwde plan gelijk is aan het getoonde plan (bedrag, ontvanger, vergoeding). |
| 10 | QA | Middel | Na opnieuw verbinden bleef de oude state staan | Opgelost | `forget()` wist sessie, state, vergoedingen en "getoond op Ledger". |
| 11 | QA | Middel | De sessie lekte als de dialoog sloot tijdens het verbinden | Opgelost | Een `mounted`-ref; een sessie die te laat binnenkomt wordt direct gesloten. |
| 12 | QA | Middel | Geen tests voor de app-controles in `connectLedger` | Opgelost | `openSession` is losgehaald en getest met een nep-apparaat: mainnet-app, andere app, oude versie, pad en key origin, weigering op het apparaat, sluiten. Een componenttest van de dialoog volgt (er is nog geen DOM-testomgeving). |
| 13 | Security | Middel | De MICA-1-vervanging is te omzeilen (`tx.sign`, `getPublicKey`, stringconcatenatie, `.mjs`) en de ADR beloofde "bundle" | Deels opgelost | Elke `.sign(` in eigen code is verboden, plus `getPublicKey`, `fromSeed`, `makeRandom`, `BIP32Factory`/`ECPair*` en `'private' +`; ook `.mjs`/`.jsx` worden gescand (met tests). De ADR zegt nu eerlijk "eigen code". Een AST-regel en een allowlist op `dist/` volgen vóór mainnet. |
| 14 | Security | Middel | De transitieve boom (één beheerder bij `@bitcoinerlab/*` en `bip32-path`) is niet gemotiveerd | Opgelost / restrisico | De volledige lijst en het risico staan in ADR-0015. `npm audit signatures` draait in CI. De client minimaliseren of vendoren volgt vóór mainnet. |
| 15 | Security, QA | Laag | Scan zonder bovengrens; kapotte of dubbele UTXO's gaven een generieke fout | Opgelost | Plafond van 1000 per tak (`scan-limit`); UTXO's worden gevalideerd en ontdubbeld. De testfixture heeft nu unieke txids. Getest. |
| 16 | Security, QA | Laag | De check `alleen-testnet` was een stringmatch | Opgelost | Elk gebruik van `NETWORK` buiten de import, het type en de herkenning van mainnet-adressen laat de check falen. |
| 17 | QA | Laag | Ontbrekende grenzen in de tests van `verifyPlan` | Opgelost | Tests voor de vergoeding precies op de grens en één sat erboven, vergoeding 0, twee wisselgelduitvoeren en invoer zonder bedrag. `recipientScript` heet nu `strangerScript`. |
| 18 | QA | Laag | Naar het eigen wisselgeldadres sturen gaf een misleidende fout | Opgelost | Eigen code `address-own-change`, getest. |
| 19 | QA | Laag | `withRetry<F>` loog over zijn type (`init` viel weg) | Opgelost | Het returntype is nu `(url) => ReturnType<F>`; een POST kan er niet meer per ongeluk doorheen. |
| 20 | QA | Laag | Niet-gemapte apparaatfouten (`0x6982`, `TransportRaceCondition`, `InvalidStateError`) | Opgelost | `locked` en een nieuwe code `busy` ("sluit Ledger Live"), getest. |
| 21 | QA, Design | Middel | Verouderde teksten: Beveiligingspagina, README, architectuur, landing-ring en huisstijl zeiden "alleen-lezen op het web" | Opgelost | Nu "alleen-lezen op mainnet" en "versturen alleen met een Ledger op testnet". |
| 22 | Design | Middel | Een mislukte lazy load ontkoppelde de hele app | Opgelost | `LazyBoundary` met een foutdialoog en "Pagina herladen"; tijdens het laden een dialoog "Laden…". |
| 23 | Design | Middel | `role="status"` op nieuwe elementen wordt vaak niet voorgelezen; bij scannen veel ruis | Opgelost | Eén vaste `aria-live`-regio. Bij scannen worden alleen begin en einde gemeld. |
| 24 | Design | Middel | `.text-button` kleiner dan 44px; `.field-label` overschreven door `.dialog p` | Opgelost | `.dialog .text-button { min-height: 44px }`, `.dialog .field-label`. |
| 25 | Design | Middel | Het testnet-signaal was te klein en het was onduidelijk vanaf welk account je verstuurt | Opgelost | `dialog-note` bovenaan: "Testnet4: testcoins zonder waarde. Je verstuurt vanaf het account op je Ledger…". |
| 26 | Design | Middel/laag | sat/vB zonder uitleg; komma en punt door elkaar; fout ver van het veld; geen kopieerknop; "Verstuurd" zonder "nog niet bevestigd" | Opgelost | Uitleg onder de vergoeding ("gaat naar het netwerk, niet naar KERN"); bedragen per taal; fout direct onder het veld met `aria-describedby`; kopieerknop voor het txid; "nog niet bevestigd". mempool.space staat nu in de intro. |
| 27 | Design | Info | Patronen ontbraken in de huisstijl | Opgelost | `kern-huisstijl.md`: patroon "Versturen met een Ledger". |
| 28 | Security | Info | `@ledgerhq/logs` biedt een globale log-hook | Geaccepteerd (testnet) | De CSP laat geen vreemde scripts toe. Vóór mainnet: client minimaliseren (ADR-0015). |
| 29 | Security | Info | mempool.space ziet ±40 adressen van één IP | Geaccepteerd (testnet) | Staat in de privacyverklaring. Vóór mainnet een eigen indexer in de EU. |

## Verificatie na de fixes
- Tests: `npm test` (core, web, api en compliance-scripts), `npm run typecheck`, `npm run compliance` en `npm run docs-check`: alle groen.
- In de browser (dev-server plus een nep-sessie): de dialoog opent lui; zonder Ledger verschijnt "Geen Ledger gekozen." in rood; de focus blijft in de dialoog; op 375px geen horizontaal scrollen.
- Productie-build met de echte headers uit `vercel.json`: Trusted Types worden afgedwongen (`innerHTML` geweigerd), geen CSP-overtredingen op landing, dashboard, ontvangen (QR), Box 3, privacy en versturen.
