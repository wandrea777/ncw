# ADR-0010: KERN als naam van bedrijf en product

- **Status:** Aangenomen · 2026-10-13
- **Context:** de eigenaar heeft een huisstijl laten ontwerpen onder de naam **KERN** (v0-project `kern-wallet-development-test-ui`). KERN wordt de naam van het bedrijf én van de wallet. Het domein wordt later gekocht.
- **Besluit:**
  - Alles wat gebruikers zien heet **KERN** (web-app, documentatie, compliance-register). De werktitel "NCW" verdwijnt uit de gebruikerstekst.
  - Code-identifiers (`@ncw/*`-pakketten, database-rollen `ncw_*`, de repo-naam) blijven voorlopig ongewijzigd. Hernoemen levert nu geen gebruikerswaarde op en raakt CI, migraties en runbooks. Dat doen we in één aparte wijziging, uiterlijk vóór de eerste publieke release.
  - De huisstijl van het v0-ontwerp is de bron van waarheid voor het uiterlijk. Zie [docs/design/kern-huisstijl.md](../design/kern-huisstijl.md).
- **Open punten (⚖️):**
  - "Kern" is een gewoon Nederlands woord. Een merkregistratie kan daardoor lastig zijn, en er kunnen al oudere rechten bestaan. **Doe de merkencheck bij het BOIP (control OND-1) vóórdat je het domein, logo of drukwerk koopt.**
  - Het v0-ontwerp noemde "KERN Europe B.V." Die rechtspersoon bestaat (nog) niet; die naam staat daarom nergens in de app.
- **Gevolgen:** `README.md`, `docs/README.md`, `compliance/register.yaml`, `index.html` en de web-app gebruiken de naam KERN.
