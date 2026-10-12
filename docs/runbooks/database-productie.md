# Database in productie

## Rollen (least privilege)
De API draait **niet** als eigenaar van de tabellen. Zo kan een gecompromitteerde API geen triggers uitschakelen of het auditlog herschrijven.

```sql
-- Eenmalig door de beheerder (eigenaar = ncw_owner, alleen gebruikt voor migraties)
CREATE ROLE ncw_owner LOGIN PASSWORD '…';
CREATE ROLE ncw_app LOGIN PASSWORD '…';
GRANT CONNECT ON DATABASE ncw TO ncw_app;
GRANT USAGE ON SCHEMA public TO ncw_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ncw_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM ncw_app;  -- alleen SELECT + INSERT
ALTER DEFAULT PRIVILEGES FOR ROLE ncw_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ncw_app;
```

- Migraties draaien als `ncw_owner` (`DATABASE_URL=<owner-url> npm run migrate -w @ncw/api`), **vóór** de deploy van de applicatie.
- De applicatie (`NODE_ENV=production`) migreert **niet** bij het starten. Ze controleert alleen-lezen of alle migraties met de juiste checksum zijn toegepast, en weigert anders te starten.
- De applicatie gebruikt `DATABASE_URL` met `ncw_app` en TLS (`sslmode=verify-full`).

## Back-ups
- Point-in-time recovery aan (minimaal 7 dagen), versleutelde back-ups in een andere regio binnen de EU.
- **Elk kwartaal een hersteltest** en het resultaat vastleggen in `docs/qa/`.

## Auditketen verankeren (gepland, ADR-0006)
Tot de automatische verankering er is: exporteer maandelijks per organisatie `integrity.head` en bewaar die buiten de database (bijv. in de bewijsbundel van de release).
