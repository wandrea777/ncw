# QA: GitHub-beveiliging aan, hostingonderzoek, CI en CRA-alarm

- **Datum:** 2026-10-14 · **Branch:** `docs-github-en-hosting`
- **Reviewer (onafhankelijk):** security-reviewer (heeft de instellingen zelf met `gh api` gelezen)
- **Opdracht van de eigenaar (letterlijk):** *"Zelf in GitHub aanzetten: secret scanning, push protection en branch protection op `main`."* → toestemming: *"Ja, zet ze aan"*. En: *"ik wil nog niet dat de server ergens anders draait, nu nog in die docker in deze test fase. houd t gratis voor nu. ik zie bijvoorbeeld deze optie van vps https://freevps.edu.pl/ onderzoek of het betrouwbaar is. en of er alternatieve zijn voor gratis vps onder studenten, want ik ben student"*

## Bevindingen → besluit → fix

| # | Ernst | Bevinding | Besluit | Fix / reden |
|---|---|---|---|---|
| 1 | Hoog | CRA-alarm valt stil: de workflow-token mag geen PR maken, en daarna werd de issue-stap overgeslagen. Een bot-PR zou ook geen CI starten en niet te mergen zijn. | Opgelost | `security-watch.yml`: eerst het issue, daarna het incidentbestand op een branch; de PR open je zelf (instructie in het issue). `pull-requests: write` verwijderd. |
| 2 | Middel | De environments `production` en `noodstop` bestaan niet; de runbook zei "✅ voor Vercel". | Docs gecorrigeerd; inrichten ligt bij de eigenaar | Rij 7 staat nu op "nog niet ingericht", met de waarschuwing dat een secret op repo-niveau de environment aanmaakt zonder reviewer. |
| 3 | Middel | Dependabot-PR's #4 en #5 zitten vast: een wankele IDOR-test (timeout 5 s op PGlite) en twee check-runs `ci` per commit (`push` zonder filter). | Opgelost | `ci.yml`: `push` alleen op `main`. `apps/api/vitest.config.ts`: `testTimeout` 30 s. De test blijft verplicht. |
| 4 | Laag | Een PR kan `ci.yml` zelf afzwakken; met 0 approvals beschermt alleen je eigen review. Fork-goedkeuring staat op "first-time contributors". | Voorgelegd aan de eigenaar | Fork-goedkeuring op "alle externe bijdragers" is een instelling; zie het eindrapport. |
| 5 | Laag | `strict=false`: het gemergde resultaat wordt vóór de merge niet getest. | Voorgelegd | Beperkt risico: de `push`-run op `main` en `release.yml` testen opnieuw. |
| 6 | Laag | Merge commits staan aan, maar de lineaire historie is verplicht, dus de mergeknop faalt. | Voorgelegd | Merge commits uitzetten is een repo-instelling. |
| 7 | Laag | De omschrijving van de repo zegt "(privé)". | Voorgelegd | Repo-instelling. |
| 8 | Info | De release-flow botst niet met de tag-rulesets. | — | — |
| 9 | Info | De overige docs kloppen met de API. | — | — |
| 10 | Laag | VPS-advies: de conclusie klopt, maar de onderbouwing bevatte niet-controleerbare punten (opslag "40 GB" terwijl er 60 GB staat). DigitalOcean ontbrak. "Art. 28 AVG" was te stellig. | Opgelost | ADR-0007 gebruikt nu controleerbare WHOIS-feiten, de Oracle-terugname, Azure West Europe, een rij voor DigitalOcean, en "zodra er echte gebruikers zijn". |
