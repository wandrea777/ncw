# Changelog

Alle noemenswaardige wijzigingen. Formaat: [Keep a Changelog](https://keepachangelog.com/nl/1.1.0/), versies volgens SemVer.

## [Onvoltooid]

### Toegevoegd
- **Backend (`apps/api`)**: PostgreSQL-schema met constraints en append-only auditlog; REST API `/v1` met OpenAPI 3.1; passkey-authenticatie (WebAuthn) met gehashte sessietokens; organisaties, rollen (eigenaar/goedkeurder/alleen-lezen), eenmalige uitnodigingen; multisig-kluizen en goedkeuringsworkflow (M-van-N) met alleen client-side ciphertext; manipulatiebestendig auditlog (hash-keten); rate limiting, CSRF-origincontrole, beveiligingsheaders, body limit.
- **Beveiliging na onafhankelijke review** ([docs/qa/2026-10-12-backend.md](docs/qa/2026-10-12-backend.md), ADR-0009):
  - ondertekenaars per kluis met gewogen goedkeuringen (solo-ondernemer met meerdere sleutels werkt);
  - step-up: verse passkey-bevestiging gebonden aan één actie;
  - uitnodigingen geven nooit eigenaarschap, zijn intrekbaar, en nieuwe leden blijven *pending* tot bevestiging met een veiligheidscode;
  - passkey- en sessiebeheer, kloondetectie vóór verificatie, opruimen van challenges;
  - endpoints voor E2EE-sleuteldistributie;
  - strikte base64, fail-closed configuratie, TRUNCATE-blokkade op het auditlog, migratielock.
- Verificatieronde door een tweede onafhankelijke reviewer verwerkt: step-up ook voor annuleren, intrekken en encryptiesleutel; productie migreert niet bij start (least privilege); stemmen van verwijderde leden vervallen; kloondetectie pas na geverifieerde handtekening; security-watch gesplitst in een alleen-lezen-scan en een rapport-job.
- 57 API-tests, ook draaibaar tegen echte PostgreSQL (`TEST_DATABASE_URL`, standaard in CI).
- Commit-hook en CI-check: geen AI-assistent als (co-)auteur in commits.
- CI: alle workspaces getest, Postgres-service, actions op commit-SHA, `--ignore-scripts`, rechten per job, release via beschermde environment, documentatie-check op PR's.
- Documentatiestructuur: `docs/` (architectuur, 9 ADR's, dreigingsmodel, API, runbooks, QA-rapporten), `CLAUDE.md`, reviewer-agents in `.claude/agents/`.
- Positionering op ondernemers met grote vermogens (ADR-0008, `docs/product/zakelijk.md`).
- `docker-compose.yml` voor lokale PostgreSQL.

### Opgelost
- Auditlog gaf vanaf de tiende regel een dubbel volgnummer uit (tekstsortering van `seq`). Gevonden door tests; er staat nu een regressietest.

## [0.1.0] - 2026-10-12

### Toegevoegd
- Box 3-rekenhulp (web): werkelijk rendement versus forfaitair voor BTC en ETH, volledig in de browser.
- Compliance-systeem: register met 14 wetten, automatische checks, CRA-incidentklok, kwetsbaarhedenscan (OSV + CISA KEV), noodstop, bewijsbundel per release.
