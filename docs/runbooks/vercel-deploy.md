# Runbook: KERN op Vercel

Besluit: [ADR-0011](../adr/0011-web-hosting-vercel.md). Headers en build staan in [`vercel.json`](../../vercel.json).

**Productie gaat alleen via de release-workflow, de noodstop alleen via de noodstop-workflow.** Git-deploys op Vercel staan uit (ook previews van branches); check CRA-7 dwingt dat af.

## Eenmalig: Vercel

1. Beveilig je Vercel-account met een passkey of 2FA.
2. Ga naar **Add New → Project** en importeer de GitHub-repo. Geef de Vercel GitHub-app **alleen toegang tot deze repo**.
3. Laat **Root Directory** leeg en kies framework preset *Other*. Build en output komen uit `vercel.json`; overschrijf ze niet.
4. Onder **Settings**:
   - **Analytics** en **Speed Insights**: uit.
   - **Vercel Toolbar**: uit.
   - **Deployment Protection**: *Standard Protection*. Dat beschermt previews en gegenereerde URL's.
   - **Git Fork Protection**: aan.
5. Maak onder **Account Settings → Tokens** een token met scope alleen dit team en met een vervaldatum. Vernieuw hem vóór die datum.
6. **Ontkoppel de Git-integratie** (Settings → Git → Disconnect). `vercel.json` zet Git-deploys uit, maar een branch kan zijn eigen `vercel.json` hebben.
7. Zet onder **Deployment Protection → Protection Bypass for Automation** een geheim aan. De workflows gebruiken het om de beschermde preview te testen vóór promotie.

## Eenmalig: GitHub (environments `production` en `noodstop`)

| Soort | Naam | Waarde |
|---|---|---|
| Secret | `VERCEL_TOKEN` | het token uit stap 5 |
| Secret | `VERCEL_AUTOMATION_BYPASS_SECRET` | het geheim uit stap 7 |
| Variabele | `ATTESTATION` | Niet zetten. De repo is openbaar, dus attestaties werken. Alleen `off` als de repo ooit weer privé wordt |
| Variabele | `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | te vinden onder Project → Settings → General |
| Variabele | `SITE_URL` | bijvoorbeeld `https://kern-xxx.vercel.app`; later je eigen domein |

Zet op beide environments een **deployment branch policy**:
- `production`: alleen tags `v*`, met verplichte reviewer (jij);
- `noodstop`: alleen `main`, zonder wachttijd.

Anders kan een workflow vanaf een willekeurige branch de token gebruiken. Zet in de repo-instellingen (de repo is openbaar) ook **secret scanning** en **push protection** aan, en **branch protection** op `main` (CI verplicht). Zet daarnaast een **tag-ruleset** op `v*`: alleen jij mag tags maken, ondertekend, en niemand mag ze verwijderen of verplaatsen.

## Release (productie)

Maak een ondertekende tag `vX.Y.Z` op `main`. De workflow `release.yml` doet dan het volgende:
1. tests en de strengste compliance-check draaien, met `pipefail`;
2. de bewijsbundel samenstellen en de site- en bewijs-zip attesteren;
3. in een aparte job: de attestatie controleren, weigeren als de noodstop live aan staat, deployen als preview, de rooktest draaien op headers, 404 en `status.json`, dan promoveren naar productie;
4. de rooktest opnieuw draaien op `SITE_URL`.

## Noodstop

Ga naar GitHub → Actions → **Noodstop** → *Run workflow* en kies `aan` met een bericht. Dat kan ook vanuit de GitHub-app op je telefoon. De workflow:
- neemt de site van de laatste release (of de tag die je opgeeft);
- controleert de attestatie;
- verandert alleen `status.json`;
- deployt als preview, draait de rooktest en promoveert;
- controleert live dat de noodstop aan staat.

Uitzetten gaat op dezelfde manier met `uit`. Een nieuwe release weigert te deployen zolang de noodstop live aan staat en `status.json` in de repo op uit staat. **Oefen dit één keer vóór livegang.**

## API (nodig om in te loggen)

De web-app praat met de API op dezelfde origin (`/v1`). Zonder gehoste API toont de site de landing, maar inloggen geeft "server niet bereikbaar". Opties, te kiezen in ADR-0007:
- De API op een eigen host, bijvoorbeeld `api.<domein>`, achter een reverse proxy die `/v1` op het hoofddomein doorstuurt.
- Een Vercel-rewrite van `/v1/(.*)` naar de API. Let op: daarvoor moet check CRA-7 `rewrites` voor precies dat pad toestaan. Dat is een bewuste wijziging met een eigen review.

Zet in de API `APP_ORIGIN` op de exacte web-origin en `RP_ID` op het domein. Passkeys zijn aan dat domein gebonden: een passkey die op `*.vercel.app` is gemaakt, werkt niet op je eigen domein. **Kies dus eerst je definitieve domein en ga daarna pas live met accounts.**

## Vóór de eerste euro omzet

Het Hobby-plan is alleen voor niet-commercieel gebruik. Stap over naar **Vercel Pro** of terug naar **Cloudflare Pages**; `_headers` is identiek, en check CRA-7 bewaakt dat.
