# ADR-0011: De web-app voorlopig op Vercel

- **Status:** Aangenomen · 2026-10-13 · vult [ADR-0007](0007-hosting-eu.md) aan voor de statische web-app (API en database blijven onder ADR-0007)
- **Context:** de eigenaar wil de web-app voorlopig privé hosten via Vercel. Het plan noemde Cloudflare Pages. De web-app is statisch (Vite-build, hash-routing, geen server-side code), dus elke statische host volstaat.
- **Besluit:**
  - De web-app wordt geserveerd door Vercel volgens [`vercel.json`](../../vercel.json) in de root van de repo.
  - **Geen Git-deploys op Vercel** (`git.deploymentEnabled = false`): geen automatische productie en geen previews van branches. Alles gaat via GitHub Actions.
  - **Productie alleen via `release.yml`, in twee jobs:**
    1. *build*: tests (met `pipefail`), compliance, de bewijsbundel en een **build-attestatie** op de site- en bewijs-zip.
    2. *deploy*: een schone runner met **code van main** (vertrouwd), nooit code van de tag. De stappen:
       - `scripts/verify-release.sh` controleert dat de tag op main staat, dat release en asset door `github-actions[bot]` zijn gemaakt, en de attestatie van precies `release.yml` en precies deze tag;
       - weigeren als de noodstop live aan staat en de release hem stil zou opheffen;
       - de Vercel CLI installeren uit een eigen lockfile (`tools/vercel-cli`, versie 62.4.0, `--ignore-scripts`, Dependabot);
       - een productie-build zonder domein (`--prebuilt --prod --skip-domain`), de rooktest op die URL, dan **direct promoveren** (geen herbouw, dus wat getest is gaat live);
       - een rooktest met retries op `SITE_URL`.
    Release en noodstop delen een `concurrency`-groep en draaien dus nooit tegelijk.
  - **Noodstop op Vercel:** `noodstop.yml` doet hetzelfde met een release naar keuze (standaard de laatste) en alleen een andere `status.json`, en wacht tot de nieuwe stand live staat.
  - **Openbare repo (sinds 2026-10-14):** build-attestaties werken. De variabele `ATTESTATION=off` (alleen herkomst via tag en uploader) is alleen nog een noodterugval als de repo ooit weer privé wordt.
  - **Dezelfde beveiligingsheaders als op Cloudflare Pages.** `apps/web/public/_headers` blijft bestaan, zodat we zonder codewijziging terug kunnen naar Cloudflare. Check **CRA-7 (`headers-gelijk`)** laat CI en de Vercel-build falen bij:
    - een verschil tussen `vercel.json` en `_headers`;
    - verwijderregels, dubbele headers, voorwaardelijke regels (`has`/`missing`) of onbekende sleutels zoals `routes` en `rewrites`;
    - een CSP buiten `/*`;
    - automatische productie-deploys die aan staan.
  - **Geen Vercel Analytics of Speed Insights.** Het v0-ontwerp bevatte `@vercel/analytics`; dat is niet overgenomen. De trackercheck (AVG-2) zoekt nu ook naar Vercel-analytics.
  - Op preview-deployments: Vercel Toolbar uit en Deployment Protection aan. De CSP blokkeert de toolbar sowieso, omdat die scripts van een ander domein laadt.
- **Restrisico Vercel CLI:** `npm audit` meldt 33 kwetsbaarheden in de dependencies van de CLI: 1 kritiek (`tar`, file smuggling bij het uitpakken), 24 hoog en 8 middel, waaronder `undici` en `path-to-regexp`. Een groot deel is DoS-klasse.
  - **Waarom geaccepteerd:** in onze flow pakt de CLI geen onvertrouwde archieven uit. Hij draait alleen in CI, op een gecontroleerd eigen artefact, zonder install-scripts, met Dependabot.
  - **Wat overblijft:** 383 pakketten die meedraaien met `VERCEL_TOKEN`.
  - **Plan:** deployen via de REST-API met een eigen script zonder dependencies (Build Output uploaden). Bij elke CLI-update opnieuw beoordelen.
- **Voorwaarden en beperkingen:**
  - **Het Hobby-plan van Vercel is alleen voor niet-commercieel gebruik.** Zodra er geld binnenkomt (premium, partnerlinks of B2B), moet de site naar **Vercel Pro** (per teamlid per maand) of terug naar **Cloudflare Pages** (gratis, commercieel toegestaan). Dat staat op de releasechecklist.
  - Vercel Inc. is een Amerikaans bedrijf. Het verwerkt de IP-adressen van bezoekers om de site te leveren. De privacyverklaring vermeldt dit. De verwerkersovereenkomst (DPA) en de grondslag voor doorgifte buiten de EER controleren we bij control AVG-3.
  - Het Vercel-account moet beveiligd zijn met een passkey of 2FA. De GitHub-koppeling krijgt alleen toegang tot deze repo.
- **Mobiele apps:** die worden niet via Vercel verspreid maar via de App Store en Google Play. Daarvoor verandert dit besluit niets. Een backend voor de apps valt onder ADR-0007.
- **Alternatieven:** Cloudflare Pages (gratis en commercieel toegestaan, het plan); Scaleway of Hetzner (EU-jurisdictie, meer beheer).
