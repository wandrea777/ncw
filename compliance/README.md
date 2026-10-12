# Compliance-systeem NCW

*Stand: 12 oktober 2026. Geen juridisch advies; ⚖️ = laten bevestigen door een jurist.*

## 1. Het principe: risico wegontwerpen, de rest automatisch bewaken

"Automatisch compliant" betekent hier drie lagen:

| Laag | Wat | Voorbeeld |
|---|---|---|
| **1. Wegontwerpen** | Een regel kan niet overtreden worden omdat de functie niet bestaat | Geen server → geen persoonsgegevens. Geen sleutels → geen MiCA, geen Wwft en geen schade door verloren crypto. |
| **2. Afdwingen in code** | Een overtreding breekt de build | Een nieuwe externe partij zonder vermelding in de privacyverklaring laat de CI falen. Een misleidende claim ook. |
| **3. Bewaken en alarmeren** | Wat niet afdwingbaar is wordt bewaakt, met deadlines en meldingen | CRA-meldklok elk uur, dagelijkse kwetsbaarhedenscan, jaarlijkse handmatige controles met vervaldatum |

**Wat niet te automatiseren is** (en dat beweert ook niemand die het serieus neemt): juridische beoordeling, het daadwerkelijk indienen van een melding bij ENISA (dat moet de fabrikant zelf doen), een verzekering afsluiten en de fiscale controle door een adviseur. Die staan als **handmatige controls met vervaldatum** in het register. Een release is technisch onmogelijk zolang ze verlopen zijn.

## 2. Wat er per wet geregeld is

Volledig overzicht: [`register.yaml`](register.yaml). Samengevat:

| Wet | Geldt? | Hoe geborgd |
|---|---|---|
| MiCA / Wwft / DAC8 | Nee | Fase 0 kan technisch geen sleutels of transacties bevatten (check `geen-sleutelbibliotheken`). Een jurist toetst vóór elke transactiefunctie. |
| **Cyber Resilience Act** | Vrijwillig nu ⚖️, verplicht in fase 1 (app) | security.txt + CVD-beleid, dagelijkse scan (OSV + CISA KEV), automatische incidentaanmaak, meldklok elk uur, vooraf ingevulde meldteksten, SBOM bij elke build |
| **Productaansprakelijkheid** | Ja, vanaf 9-12-2026 | Fase 0 kan geen data vernietigen; rekenfout = zuivere vermogensschade ⚖️. Tests als verplichte gate, bewijsbundel per release (10 jaar), noodstop, verzekering |
| Box 3-juistheid | Ja | Parameters met bron; een release is geblokkeerd tot ze geverifieerd zijn; jaarlijkse review door een adviseur |
| AVG | Ja | Code, CSP en privacyverklaring worden automatisch gelijk gehouden; geen trackers; geen server |
| Cookies (Tw 11.7a) | Ja | Geen opslag op het apparaat, automatisch gecontroleerd → geen banner nodig |
| Consumentenrecht | Ja | Redelijke voorwaarden (concept), placeholders blokkeren een release, juridische toets |
| Oneerlijke handelspraktijken | Ja | Copy-lint op verboden claims |
| Toegankelijkheid (EAA) | Nee (micro-onderneming) | Jaarlijkse WCAG-check |
| Licenties | Ja | Alleen toegestane licenties in wat we meeleveren |
| KvK / btw / merk | Ja | Handmatige control |

## 3. De automatisering

| Wanneer | Wat | Bestand |
|---|---|---|
| Elke push / PR | Tests, typecheck, build, compliance-check, SBOM | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |
| Dagelijks 05:00 UTC | Kwetsbaarhedenscan + compliance in releasemodus → issue. Bij actief misbruik: CRA-incident automatisch aangemaakt en gecommit | [`security-watch.yml`](../.github/workflows/security-watch.yml) |
| Elk uur | CRA-meldklok: < 12 uur of verstreken → issue (pushmelding via de GitHub-app) | [`incident-clock.yml`](../.github/workflows/incident-clock.yml) |
| Tag `v*` | Strengste check, bewijsbundel als release-asset, deploy | [`release.yml`](../.github/workflows/release.yml) |
| Handmatig (ook vanaf je telefoon) | Noodstop aan of uit binnen ~1 minuut | [`noodstop.yml`](../.github/workflows/noodstop.yml) |
| Wekelijks | Dependabot-updates voor npm en Actions | [`dependabot.yml`](../.github/dependabot.yml) |

Lokaal:

```bash
npm run compliance
```

```bash
npm run compliance:release
```

```bash
npm run vuln-watch
```

```bash
npm run incident -- status
```

## 4. Incidentprocedure (CRA art. 14)

**Wanneer meld je?** Bij een **actief misbruikte kwetsbaarheid** in ons product, of een **ernstig incident** dat de beveiliging van het product raakt. Een kwetsbaarheid in een afhankelijkheid die ons product niet raakt hoef je niet te melden. Leg die afweging wel vast in het incidentlogboek.

| Stap | Termijn | Commando na indienen |
|---|---|---|
| 0. Incident registreren (start de klok) | Direct bij kennisname | `npm run incident -- nieuw --soort kwetsbaarheid --titel "..."` |
| 1. Afschermen | Zo snel mogelijk | GitHub → Actions → **Noodstop** → aan |
| 2. Early warning via het ENISA Single Reporting Platform | **24 uur** | `npm run incident -- gemeld <id> earlyWarning` |
| 3. Melding | **72 uur** | `npm run incident -- gemeld <id> melding` |
| 4. Gebruikers informeren | Zonder onnodige vertraging | `npm run incident -- gebruikers <id>` |
| 5. Fix uitrollen | — | `npm run incident -- fix <id>` |
| 6. Eindrapport | Kwetsbaarheid: 14 dagen na de fix · incident: 1 maand na de melding | `npm run incident -- gemeld <id> eindrapport` |
| 7. Sluiten | — | `npm run incident -- sluit <id>` |

Concept-teksten voor elke stap staan na `nieuw` in `compliance/incidents/<id>/`. Commit het incidentbestand: het logboek is je bewijs.

## 5. Productaansprakelijkheid: bewijsbeleid

De nieuwe richtlijn legt de bewijslast deels bij de fabrikant. Wie relevant bewijs niet kan overleggen, kan te maken krijgen met een vermoeden dat het product gebrekkig is (art. 9–10). Daarom:

- **Elke release** bevat een `bewijs-vX.Y.Z.zip` als GitHub Release-asset: commit, testuitvoer, SBOM, compliance-rapport, register, incidenten en hashes van alle gepubliceerde bestanden.
- **Bewaartermijn: minimaal 10 jaar** (de vervaltermijn van de richtlijn). Maak daarnaast jaarlijks een kopie van alle bewijsbundels naar eigen opslag, want GitHub is geen archief.
- **Updates:** de web-app wordt centraal bijgewerkt, dus gebruikers draaien altijd de nieuwste versie. Dat beperkt aansprakelijkheid voor het niet leveren van updates (art. 11 lid 2).
- **"Stand van de techniek"-verweer:** het register, de bronnen in `PLAN.md` en de testsuite documenteren dat we de stand van de techniek volgden.

## 6. Eenmalige inrichting (door jou)

1. [ ] Private GitHub-repo aanmaken en pushen; **branch protection** op `main` met CI als verplichte check.
2. [ ] GitHub-app op je telefoon met meldingen aan voor issues (dat is je alarm).
3. [ ] Cloudflare-account → Pages-project → secrets `CLOUDFLARE_API_TOKEN` en `CLOUDFLARE_ACCOUNT_ID`, en variabele `CF_PAGES_PROJECT`.
4. [ ] Domein + `security@`-mailadres; vul `security.txt`, Privacy en Voorwaarden in.
5. [ ] Box 3-parameters controleren op belastingdienst.nl → `verified: true` en `verifiedOn` in `packages/core/src/box3/params.ts`.
6. [ ] Handmatige controls uitvoeren en `laatstGecontroleerd` invullen in `register.yaml`.
7. [ ] Account bij het ENISA Single Reporting Platform (control CRA-5).
8. [ ] Juridische check (CONS-2, MICA-2) en verzekering (PLD-4).
