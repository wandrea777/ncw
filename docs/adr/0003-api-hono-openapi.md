# ADR-0003: API met Hono + OpenAPI, minimale dependencies

- **Status:** Aangenomen · 2026-10-12
- **Context:** de API is de "tussenlaag" tussen de apps, de database en de integraties. Elke dependency is aanvalsoppervlak (supply chain).
- **Besluit:**
  - **REST** onder `/v1`, beschreven met **OpenAPI 3.1** (gegenereerd uit de code: `docs/api/openapi.json`). Clients en integratiepartners krijgen zo een exact contract.
  - **Hono** (klein, zonder dependencies, draait op Node en edge-runtimes) + **zod** voor validatie van elke request.
  - **Geen ORM**: een eigen dunne `Db`-interface met alleen geparametriseerde SQL. Het auditen is eenvoudiger en er is geen magie.
  - 7 runtime-dependencies in totaal (hono, @hono/node-server, @hono/zod-openapi, zod, pg, @electric-sql/pglite, @simplewebauthn/server).
- **Alternatieven:** Express/NestJS (meer dependencies, zwaarder); GraphQL (complexer autorisatiemodel en meer aanvalsoppervlak); tRPC (geen taal-onafhankelijk contract voor partners).
- **Gevolgen:** integraties (boekhouding, ramps) krijgen eigen versie-onafhankelijke endpoints of webhooks met handtekening. Breaking changes gaan naar `/v2`.
