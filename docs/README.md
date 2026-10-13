# Documentatie KERN

| Onderwerp | Document |
|---|---|
| Businessplan en roadmap | [../PLAN.md](../PLAN.md) |
| Product voor ondernemers | [product/zakelijk.md](product/zakelijk.md) |
| Architectuur | [architecture/overview.md](architecture/overview.md) |
| Besluiten (ADR's) | [adr/README.md](adr/README.md) |
| Huisstijl | [design/kern-huisstijl.md](design/kern-huisstijl.md) |
| Dreigingsmodel | [security/threat-model.md](security/threat-model.md) |
| API-contract (OpenAPI 3.1) | [api/openapi.json](api/openapi.json) · [api/README.md](api/README.md) |
| Compliance | [../compliance/README.md](../compliance/README.md) |
| QA-rapporten van onafhankelijke reviewers | [qa/README.md](qa/README.md) |
| Runbooks | [lokaal ontwikkelen](runbooks/lokaal-ontwikkelen.md) · [database productie](runbooks/database-productie.md) · [GitHub beveiligen](runbooks/github-beveiligen.md) · [Vercel-deploy](runbooks/vercel-deploy.md) · [zelf testen](runbooks/testen.md) |
| Wijzigingen | [../CHANGELOG.md](../CHANGELOG.md) |
| Werkafspraken (ook voor Claude) | [../CLAUDE.md](../CLAUDE.md) |

**Regel:** documentatie wordt bijgewerkt in dezelfde wijziging als de code. De CI controleert dat `CHANGELOG.md` meeverandert met code (`scripts/docs-check.mjs`).
