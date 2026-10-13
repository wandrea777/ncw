# QA: KERN web-wallet (v0-ontwerp gekoppeld aan API en rekenkern) en Vercel-hosting

- **Datum:** 2026-10-13 · **Branch:** `kern-huisstijl`
- **Reviewers (onafhankelijk, frisse context, wijzigen niets):**

  | Ronde | Reviewers |
  |---|---|
  | 1 | qa-reviewer, security-reviewer, design-reviewer |
  | 2 | qa-reviewer, security-reviewer, design-reviewer |
  | 3 | qa-reviewer en security-reviewer, als verificatie |

- **Opdracht van de eigenaar** (letterlijk, leidend): *"het aangeleverde ui was al heel goed … hoezeo heb je er geen non custodial wallet frontend van gemaakt … je hoefde alleen mijn backend en frontend aan elkaar an te laten sluiten … je moest de opensource backend core code linken aan die fornt end en uitbreiden. doe dit ook echt"*. Eerder: KERN = bedrijf en wallet, privé hosten op Vercel, "zo veilig mogelijk", Bitcoin én EVM.

## Verloop

1. **Eerste versie (verworpen door de eigenaar):** een eigen landingspagina met de box 3-rekenhulp, alleen in KERN-stijl. Ronde 1 vond onder meer:
   - de noodstop werkte niet op Vercel;
   - productie omzeilde de release-poorten;
   - de header-check was te los;
   - het dreigingsmodel was niet bijgewerkt;
   - er stonden claims op de pagina die niet klopten.

   De eigenaar wees de aanpak af: het v0-ontwerp moest blijven. → Opnieuw gebouwd (ADR-0013).
2. **Tweede versie:** het v0-ontwerp 1-op-1, gekoppeld aan de passkey-API en de rekenkern. Ronde 2 vond de punten hieronder.
3. **Fixes en verificatie (ronde 3).**

## Bevindingen → besluit → fix of reden

### Security

| # | Ernst | Bevinding | Besluit | Fix / reden |
|---|---|---|---|---|
| S1 | Hoog | De noodstop deployt naar Cloudflare, terwijl de site op Vercel draait | Opgelost | `noodstop.yml` deployt via de Vercel CLI, met een rooktest |
| S2 | Hoog | Productie omzeilt `release.yml` via de Git-integratie | Opgelost | `git.deploymentEnabled=false` (afgedwongen door CRA-7); productie alleen via release |
| S3 | Middel | `headers-gelijk` slaagt bij verwijderregels, dubbele headers, `has`/`missing`, `routes` en een CSP op een subpad | Opgelost | `lintHeadersFile` en `lintVercelConfig`, met 12 tests |
| S4 | Middel | Dreigingsmodel en ADR-0012 onjuist of onvolledig (secp256k1 niet in Secure Enclave, updatekanaal, blind ondertekenen) | Opgelost | ADR-0012 gecorrigeerd; dreigingsmodel uitgebreid |
| S5 | Hoog | De noodstop deployt een ongecontroleerd artefact van de "latest" release | Opgelost | Build-attestatie in release; noodstop doet `gh attestation verify`, valideert de tag en gebruikt scripts van dezelfde tag |
| S6 | Middel | Geen `pipefail`: falende tests blokkeren een release niet | Opgelost | `defaults.run.shell: bash` |
| S7 | Middel | De deploy-token deelt een job met repo-dependencies; `npx vercel` haalt een niet-gepinde versie | Opgelost | Aparte deploy-job; Vercel CLI 62.4.0 met een eigen lockfile en `--ignore-scripts` |
| S8 | Middel | De rooktest draait pas na `--prod` | Opgelost | Eerst een preview, dan de rooktest (headers, 404, `status.json`), dan `vercel promote`; eigen `404.html` |
| S9 | Middel | Uitloggen kan stil mislukken | Opgelost | `logoutConfirmed`: alleen bij 204 of 401 als uitgelogd tonen, anders een melding (getest) |
| S10 | Middel | Opgeslagen adressen worden niet gevalideerd; markering van 6+6 tekens is te zwak | Opgelost | `checkAddress` met genormaliseerde vorm en de juiste chain; het volledige adres in blokken van 4, plus een waarschuwing |
| S11 | Laag | De rekenhulp mist de herkenning van herstelzinnen | Opgelost | `looksLikeSecret` in `Tool.tsx`; detectie uitgebreid (komma's, nummering, andere talen, `[uvYZ]prv`) |
| S12 | Laag | Een release kan een actieve noodstop stil opheffen | Opgelost | De deploy-job weigert als de noodstop live aan staat en `status.json` in de release uit staat |
| S13 | Info | De passkey-prompt toont "NCW" | Opgelost | `RP_NAME` standaard "KERN" |
| S14 | Info | De Vercel CLI heeft bekende kwetsbaarheden in zijn dependencies (o.a. `tar`, `undici`) | Geaccepteerd | Draait alleen in CI, op een geattesteerd eigen artefact, zonder install-scripts. Herbeoordelen bij elke update. Alternatief: REST-deploy zonder dependencies (ADR-0011) |
| S15 | Info | Restrisico's: chainbronnen zien alle adressen, de noodstop werkt alleen in de client, meerdere tabbladen, scope van de token, branch-policies | Gedocumenteerd | Dreigingsmodel §6 (7–11); runbook (branch-policies, scope en vervaldatum van de token) |
| S16 | Info | `Clear-Site-Data: "cookies"` in plaats van `"cookies", "storage"` (vervangt S15 van 2026-10-12) | Geaccepteerd | Anders verdwijnen de adressen bij elke keer uitloggen; aparte knop "Uitloggen en dit apparaat wissen" (ADR-0013 punt 7) |

### Functioneel (QA)

| # | Ernst | Bevinding | Besluit | Fix / reden |
|---|---|---|---|---|
| Q1 | Hoog | De sessie verloopt, maar het dashboard blijft open | Opgelost | Idle-timer van 30 minuten en `/v1/me` elke minuut; bij een verlopen sessie terug naar de landing (`lib/session.ts`, getest) |
| Q2 | Hoog | Zonder API toont de app "HTTP 404" | Opgelost | Een niet-JSON-respons, 404 of 405 geeft "server niet bereikbaar" (getest) |
| Q3 | Middel | Een verzending met wisselgeld naar een eigen adres heet "internal" | Opgelost | `INTERNAL_FEE_CAP` per asset; tests voor het wisselgeld-scenario en de grens |
| Q4 | Middel | Eén adres breekt alles; periodewissel haalt alles opnieuw op | Opgelost | Fouten per adres; caches voor geschiedenis en koersen; een key-check voorkomt dat verouderde data wordt getoond |
| Q5 | Middel | "vandaag" is de beweging van gisteren; het laatste grafiekpunt wijkt af van de kop | Opgelost | Label "t.o.v. gisteren"; het laatste punt is de actuele waarde |
| Q6 | Middel | De focus springt in dialogen | Opgelost | `onClose` via een ref en een focus-trap |
| Q7 | Middel | Het beveiligingscentrum toont "0 passkeys" bij een fout | Opgelost | Foutstaat met "Opnieuw"; mislukte acties geven een melding |
| Q8 | Middel | Ontvangen toont elk gevolgd adres zonder waarschuwing | Opgelost | Waarschuwing "alleen als dit adres van jou is" |
| Q9 | Middel | Claims over ondertekenen en sleutels | Opgelost | Herschreven naar feiten (`docs/design/kern-huisstijl.md`) |
| Q10 | Laag | Titel, Engelse foutteksten, profielmenu, tests | Opgelost | Titel uit v0; generieke Engelse meldingen; `useDismiss`; extra tests |
| Q11 | Ontbrekend | **Geen echte wallet-functionaliteit: versturen kan niet** | Aan de eigenaar voorgelegd | Volgens ADR-0012 komen er nooit sleutels op het web. De volgende stap is ondertekenen met een hardware wallet (testnet) of de mobiele app. |
| Q12 | Ontbrekend | De frontend gebruikt 5 van de ~30 endpoints (geen kluizen, organisaties of extra passkey) | Later | Volgende stappen: een tweede passkey toevoegen (voorkomt accountverlies) en de multisig-kluizen |
| Q13 | Ontbrekend | Geen ERC-20's en geen andere EVM-chains | Later | De rekenkern ondersteunt nu alleen native BTC en ETH |
| Q14 | Ontbrekend | Geen gehoste API: inloggen werkt in productie niet | Aan de eigenaar voorgelegd | Keuze van hosting en domein nodig (ADR-0007, runbook) |

### Design

| # | Ernst | Bevinding | Besluit | Fix / reden |
|---|---|---|---|---|
| D1 | Hoog | De taalwissel werkt niet overal (rekenhulp, juridische pagina's, foutteksten uit de kern) | Deels | Foutteksten en noodbanner zijn vertaald. Rekenhulp en juridische pagina's blijven Nederlands (Nederlandse belasting en juridische teksten); vastgelegd in de huisstijl |
| D2 | Hoog | `.add-button` verliest op mobiel zijn tekst | Opgelost | `.inline-action` |
| D3 | Hoog | Foute passkeytelling en ingeslikte fouten | Opgelost | Zie Q7 |
| D4 | Hoog | Claims die het product niet waarmaakt | Opgelost | Zie Q9 |
| D5 | Hoog | Rand van invoervelden 1,76:1 | Opgelost | `#80857f` (3,45:1) |
| D6 | Middel | Lege staat tijdens het laden | Opgelost | "—" en "Saldi en koersen ophalen…" |
| D7 | Middel | Dialoog vangt de focus niet | Opgelost | Zie Q6 |
| D8 | Middel | Raakvlakken < 44px in nieuwe CSS | Opgelost | 44px. De kleine raakvlakken uit v0 zelf zijn ongewijzigd (bekend punt) |
| D9 | Middel | Profielmenu sluit niet; `aria-label` overschrijft de zichtbare naam | Opgelost | `useDismiss`; `title` in plaats van `aria-label` |
| D10 | Middel | Taalknop en terugknop ontbreken op mobiel | Opgelost | Taalknop zichtbaar; terugknop op juridische pagina's |
| D11 | Middel | De mobiele tabbalk scrolt onzichtbaar | Later | Visueel gecontroleerd op 375px: de eerste drie tabs zijn zichtbaar en de vierde valt half buiten beeld, wat laat zien dat er meer is |
| D12 | Middel | Twee patronen voor adressen (rekenhulp tegenover dashboard) | Later | De rekenhulp behoudt zijn eigen patroon tot hij wordt herzien |
| D13 | Laag | Contrast en kleine tekst uit v0 (`--muted` 4,08:1, nav 3,72:1, centen 2,79:1) | Aan de eigenaar voorgelegd | v0 is bron van waarheid; voorstel `#646a66` |
| D14 | Laag | Nederlandse anglicismen, meervoud, ongedocumenteerde afwijkingen | Opgelost | Teksten verbeterd, enkelvoud en meervoud gesplitst, afwijkingentabel aangevuld |

### Ronde 3 (verificatie): nieuwe bevindingen

| # | Ernst | Bevinding | Besluit | Fix / reden |
|---|---|---|---|---|
| V1 | Hoog | `vercel promote` van een preview herbouwt; er gaat iets anders live dan wat getest is | Opgelost | `deploy --prebuilt --prod --skip-domain`, rooktest op die URL, dan direct `promote`; rooktest met retries op productie |
| V2 | Hoog | Attestaties werken niet in een privé-repo zonder Enterprise, waardoor de noodstop zou uitvallen | Opgelost (met keuze) | `ATTESTATION=off` als terugval: herkomst via tag op main en `github-actions[bot]` als uploader. Aanbeveling: repo openbaar maken. `attestations: read` toegevoegd |
| V3 | Middel | De noodstop draait code van een willekeurige tag met `VERCEL_TOKEN` | Opgelost | Scripts komen altijd van main; `verify-release.sh` met `--signer-workflow`, `--source-ref` en een voorouder-check; tag-ruleset in het runbook |
| V4 | Middel | Ernst van de kwetsbaarheden in de CLI onderschat; geen Dependabot | Opgelost | ADR-0011 noemt de juiste ernst (1 kritiek); Dependabot voor `tools/vercel-cli`; REST-alternatief gepland |
| V5 | Laag | Sleutelfragmenten in de foutmelding van de rekenhulp; Chinese herstelzin niet herkend | Opgelost | Elk deel apart gecontroleerd, wissen bij twijfel, geen fragmenten in beeld; woorden van één teken; sleutel midden in andere tekst (getest) |
| V6 | Laag | Geen `concurrency` tussen release en noodstop | Opgelost | Gedeelde groep `vercel-productie` |
| V7 | Middel | Netwerkfout tijdens de sessiecontrole logt uit | Opgelost | `checkSession`: alleen 401 is verlopen (getest) |
| V8 | Middel | De controle elke minuut verlengt de servertermijn eindeloos | Opgelost | Header `x-kern-session-check: 1`, GET verlengt niet (API-test) |
| V9 | Laag | Race na uit- en weer-inloggen; taalwissel reset de timer; laadstatus te vroeg uit | Opgelost | `cancelled`-vlag, `langRef`, aparte laadstatus voor geschiedenis en koersen |
| V10 | Laag | Kleine betaling (< fee-grens) met wisselgeld naar een eigen adres heet "intern"; Shift+Tab in een dialoog zonder velden | Geaccepteerd | Bewuste heuristiek (gedocumenteerd); randgeval |

## Verificatie (door de bouwer, met bewijs)

| Wat | Resultaat |
|---|---|
| `npm test` | 156 tests groen (core 59, api 59, web 26, compliance-scripts 12) |
| Typecheck en build | Groen |
| Compliance | 0 fouten, alleen bekende waarschuwingen (placeholders, handmatige controls) |
| `npm audit --omit dev` | 0 kwetsbaarheden in de app |
| Browser, echte API en echte chaindata | Registreren met passkey, adressen toevoegen (BTC en ETH), totaal in EUR, dagwijziging, grafiek, activiteit, Ontvangen met QR, beveiligingscentrum, uitloggen en weer inloggen (adressen blijven), uitloggen en wissen, NL/EN, mobiel 375px, foutstaat bij een onbereikbare API |
| Rooktest-script tegen nagebootste Vercel-output | Slaagt bij correcte headers; faalt bij een ontbrekende header en bij een verkeerde noodstopstand |

De passkey is getest met een softwarematige authenticator (WebCrypto ES256) in de testbrowser. De server verifieert echte handtekeningen.

**Niet geverifieerd:** een echte Vercel-deploy (er is geen account of token in deze omgeving). Dat betreft `vercel deploy --prebuilt` en de URL-uitvoer, `vercel promote --yes`, de headers op de standaard-404 en het attestatiepad. Dit moet bij de eerste release worden gecontroleerd (runbook).
