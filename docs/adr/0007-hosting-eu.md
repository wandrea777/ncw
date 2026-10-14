# ADR-0007: Hosting in de EU

- **Status:** Voorgesteld (besluit door de eigenaar) · 2026-10-12 · aangevuld 2026-10-14 (testfase lokaal)
- **Context:** de klanten zijn Nederlandse ondernemers; AVG; zo min mogelijk blootstelling aan niet-EU-jurisdicties. Dankzij zero-knowledge is de server-data weinig gevoelig, maar metadata (wie is lid van welke kluis) blijft vertrouwelijk.
- **Opties:**

| Optie | Database | API | Kosten (indicatie) | Opmerking |
|---|---|---|---|---|
| **A. Scaleway** (Frans, EU-only) | Managed PostgreSQL (Amsterdam/Parijs) | Serverless Containers (Amsterdam) | ± €15–30/mnd | EU-jurisdictie, aanbevolen voor productie |
| B. Supabase / Neon (EU-regio) | Managed Postgres, free tier | Fly.io (AMS) of Scaleway | € 0 tot ± €25/mnd | Goedkoop starten; Amerikaanse bedrijven (CLOUD Act) |
| C. Hetzner (Duits) | Zelf beheren op VPS | Zelf beheren | ± €5–10/mnd | Goedkoopst, maar patchen, back-ups en monitoring doe je zelf |

- **Voorstel:** staging op optie B (gratis), **productie op optie A** vóór de eerste betalende klant.
- **Eisen ongeacht de keuze:** TLS naar de database (de API weigert anders te starten in productie), point-in-time recovery, versleutelde back-ups, aparte database-gebruiker met minimale rechten voor de API (geen superuser, geen `ALTER TABLE`), secrets in een secret manager, logs zonder IP of persoonsgegevens.

## Aanvulling 14 oktober 2026: testfase lokaal, gratis opties onderzocht

**Besluit van de eigenaar:** zolang KERN in de testfase is, draait de API **alleen lokaal in Docker** (`docker compose up -d`, zie `docs/runbooks/lokaal-ontwikkelen.md`). Er komt geen online server en het blijft gratis. Inloggen met een passkey werkt daardoor alleen lokaal; de web-app op Vercel toont "server niet bereikbaar".

**Onderzoek gratis VPS-aanbieders voor studenten:**

| Optie | Oordeel | Waarom |
|---|---|---|
| freevps.edu.pl | ❌ **Niet gebruiken** | Geen rechtspersoon, adres of KvK/KRS/NIP. De specificaties verschillen per pagina (40 GB tegenover niet vermeld; "30 dagen" tegenover "zolang je studeert"). Vraagt om een studentenpas zonder uit te leggen wie die bewaart. Linkt naar een "Forex VPS". De reclame staat op Google Sites, carrd en dev.to, en er zijn geen onafhankelijke recensies. Een anonieme partij met root-toegang tot de server is een supply-chain-risico, en voor AVG-verwerking is een **verwerkersovereenkomst** met een aanwijsbare partij verplicht (art. 28 AVG). |
| Oracle Cloud Always Free (Amsterdam/Frankfurt) | ⚠️ Kan voor staging | Gratis ARM-VM. In 2026 teruggebracht naar 2 OCPU / 12 GB; er zijn meldingen van uitgeschakelde gratis instances in `eu-amsterdam-1`. Vraagt een creditcard ter verificatie. Amerikaans bedrijf (CLOUD Act). |
| GitHub Student Developer Pack | ✅ Beste gratis start | Azure for Students ($100 tegoed, 18+, stopt automatisch zonder kosten als het op is), Heroku ($13 per maand gedurende 24 maanden), en een gratis domein voor één jaar (Name.com: o.a. `.app`/`.dev`; Namecheap `.me`; `.tech`). Let op: een gratis domein voor één jaar betekent daarna gewoon betalen, en een merkdomein (bijv. `kern….nl`) koop je liever direct zelf. |
| Supabase / Neon (EU-regio) | ✅ Voor de database in staging | Gratis Postgres in de EU, met een verwerkersovereenkomst. Amerikaanse bedrijven. |

**Gevolg:** de keuze voor productie (optie A, Scaleway) blijft staan. Voor een online staging-omgeving gebruiken we een aanbieder met een verwerkersovereenkomst uit de tabel hierboven, nooit een anonieme gratis VPS.

Bronnen: [freevps.edu.pl](https://freevps.edu.pl/), [GitHub Student Developer Pack](https://education.github.com/pack), [Linuxiac over Oracle Always Free](https://linuxiac.com/oracle-quietly-cuts-free-tier-ampere-a1-resources-in-half/), [InfoQ juli 2026](https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/).
