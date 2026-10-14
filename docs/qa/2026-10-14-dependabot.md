# QA: Dependabot-PR's #4 en #5, cooldown

- **Datum:** 2026-10-14 · **Reviewer (onafhankelijk):** security-reviewer
- **Opdracht van de eigenaar (letterlijk):** *"can you merge or fix all pull requests"*

| # | Ernst | Bevinding | Besluit | Fix / reden |
|---|---|---|---|---|
| 1 | Middel | PR #5 (vercel 63.1.2, gepubliceerd op 09-10) breekt de eigen regel "minstens 7 dagen oud" (`tools/vercel-cli/package.json`) | Niet mergen vóór 16-10 21:14 UTC | Er is nu een Dependabot-cooldown van 7 dagen, zodat de regel automatisch geldt. |
| 2 | Middel | Groene CI zegt niets over de CLI: `ci.yml` installeert hem niet | Open | Vóór de volgende echte release of noodstop eerst één preview-run met de nieuwe CLI. Een rooktest in CI volgt. |
| 3 | Laag | ADR-0011 en CHANGELOG noemen nog 62.4.0 | Bijwerken bij de merge van #5 | — |
| 4 | Info | #5: dezelfde 384 pakketten, geen nieuwe install-scripts of hosts, dezelfde publisher; `npm audit` gelijk | — | — |
| 5 | Info | Vercel-telemetrie staat standaard aan in de deploy-jobs | Opgelost | `VERCEL_TELEMETRY_DISABLED=1` in release en noodstop. |
| 6 | Info | #4 (lucide-react 1.55.0) is schoon: alleen SVG-iconen, geen netwerk- of DOM-sinks, SLSA-provenance | Mergen vanaf 17-10 06:13 UTC | Gepubliceerd op 10-10. Het pakket zit in de wallet-bundle, dus ook hier geldt 7 dagen. |
| 7 | Laag | lucide-react heeft één beheerder | Geaccepteerd | Restrisico; `npm audit signatures` draait nu in CI. |

## Vervolg (2026-10-14)
- Na de cooldown verving Dependabot #4 door **#9: lucide-react 1.52.0** (gepubliceerd op 2026-10-04, dus 10 dagen oud). ISC, geen dependencies, SLSA-provenance, geen nieuwe pakketten in de lockfile, en valt binnen de reeds gereviewde wijzigingen 1.17 → 1.55. **Gemerged** bij groene CI.
- #5 (vercel 63.1.2) wacht tot 16-10 21:14 UTC, en daarna eerst een preview-run.
