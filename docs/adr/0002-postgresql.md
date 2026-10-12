# ADR-0002: PostgreSQL als database

- **Status:** Aangenomen · 2026-10-12
- **Context:** de vraag was "moet het SQL zijn?". De data is sterk relationeel: organisaties → leden → rollen, kluizen → voorstellen → beslissingen. Correctheid is belangrijker dan schaal: een goedkeuring mag nooit dubbel of half worden geteld.
- **Besluit:** **ja, SQL: PostgreSQL 17.**
  - **ACID-transacties** met rij-locks (`FOR UPDATE`) en advisory locks: goedkeuringen worden atomair geteld, ook als twee bestuurders tegelijk klikken (getest).
  - **Constraints in de database zelf** (drempel ≤ aantal ondertekenaars, geldige rollen, unieke beslissing per persoon). Ook bij een bug in de API blijft de data consistent.
  - **Triggers** maken het auditlog append-only.
  - Volwassen, open source, overal in de EU als managed dienst beschikbaar. Geen vendor lock-in.
  - **PGlite** (PostgreSQL in WebAssembly) voor ontwikkelen en testen: dezelfde SQL, geen installatie nodig.
- **Alternatieven:**
  - *MongoDB/document-DB*: zwakkere garanties over meerdere documenten; relaties en constraints zelf bouwen.
  - *Firebase/Supabase-client-direct*: logica in de client of in RLS-regels is moeilijker te auditen; wel bruikbaar als *hosting* voor Postgres (zie ADR-0007).
  - *SQLite*: prima, maar minder geschikt voor gelijktijdige writes en managed hosting.
- **Gevolgen:** migraties als SQL-bestanden met checksum (een gewijzigde migratie weigert te starten). Queries altijd geparametriseerd via de `Db`-interface.
