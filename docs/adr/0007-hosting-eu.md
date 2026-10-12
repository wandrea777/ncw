# ADR-0007: Hosting in de EU

- **Status:** Voorgesteld (besluit door de eigenaar) · 2026-10-12
- **Context:** de klanten zijn Nederlandse ondernemers; AVG; zo min mogelijk blootstelling aan niet-EU-jurisdicties. Dankzij zero-knowledge is de server-data weinig gevoelig, maar metadata (wie is lid van welke kluis) blijft vertrouwelijk.
- **Opties:**

| Optie | Database | API | Kosten (indicatie) | Opmerking |
|---|---|---|---|---|
| **A. Scaleway** (Frans, EU-only) | Managed PostgreSQL (Amsterdam/Parijs) | Serverless Containers (Amsterdam) | ± €15–30/mnd | EU-jurisdictie, aanbevolen voor productie |
| B. Supabase / Neon (EU-regio) | Managed Postgres, free tier | Fly.io (AMS) of Scaleway | € 0 tot ± €25/mnd | Goedkoop starten; Amerikaanse bedrijven (CLOUD Act) |
| C. Hetzner (Duits) | Zelf beheren op VPS | Zelf beheren | ± €5–10/mnd | Goedkoopst, maar patchen, back-ups en monitoring doe je zelf |

- **Voorstel:** staging op optie B (gratis), **productie op optie A** vóór de eerste betalende klant.
- **Eisen ongeacht de keuze:** TLS naar de database (de API weigert anders te starten in productie), point-in-time recovery, versleutelde back-ups, aparte database-gebruiker met minimale rechten voor de API (geen superuser, geen `ALTER TABLE`), secrets in een secret manager, logs zonder IP of persoonsgegevens.
