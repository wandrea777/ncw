# QA-rapport: lokale PostgreSQL-tests

- **Datum:** 2026-10-13 · **Reviewer:** qa-reviewer (frisse context)
- **Opdracht van de eigenaar:** "Probeer opnieuw": Docker en een lokale PostgreSQL werkend krijgen, zodat de API-tests ook lokaal tegen een echte database draaien.

## Wat er gebeurde
- Docker Desktop draaide, maar de VM was ± 68 uur onbereikbaar (`com.docker.backend.log`: "still waiting … connection refused"). Een volledige herstart loste het op (engine 29.8.0).
- PostgreSQL 17.11 via `docker compose`. **Alle 57 API-tests slagen lokaal tegen echte PostgreSQL**, en de server start en migreert ertegen.
- Bevinding van de bouwer zelf: testschema's bleven achter. Na elk testbestand wordt nu automatisch opgeruimd.

## Review
| # | Ernst | Bevinding | Besluit |
|---|---|---|---|
| 1 | Laag | Opruimverbinding niet gesloten als een `DROP` faalt | Opgelost (`try/finally`, fout per schema afgevangen) |
| 2 | Laag | Zelfde patroon bij `CREATE SCHEMA` (bestond al) | Opgelost |

Oordeel reviewer: goedgekeurd. SQL-interpolatie is veilig, want de schemanamen zijn altijd `t_` + hex.

**Eindstand:** 57/57 tegen PostgreSQL en 57/57 tegen PGlite, 0 achtergebleven schema's, typecheck schoon.
