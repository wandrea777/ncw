# Lokaal ontwikkelen

## Eenmalig
```bash
npm install
```

## API (backend)
```bash
npm run dev:api
```
- Draait op http://127.0.0.1:8787 met een lokale PGlite-database in `apps/api/.data/` (geen Docker nodig).
- Met echte PostgreSQL: start `docker compose up -d` en zet `DATABASE_URL=postgres://ncw:ncw@localhost:5432/ncw?sslmode=disable`.
- Gezondheid: http://127.0.0.1:8787/health · contract: http://127.0.0.1:8787/v1/openapi.json

## Web-app
```bash
npm run dev
```

## API-tests tegen echte PostgreSQL (lokaal)
```bash
docker compose up -d
```
```bash
TEST_DATABASE_URL="postgres://ncw:ncw@localhost:5432/ncw?sslmode=disable" npm test -w @ncw/api
```
Elk testscenario krijgt een eigen tijdelijk schema, dat na afloop automatisch wordt verwijderd.

**Docker reageert niet?** Als `docker info` blijft hangen of een "500 Internal Server Error" geeft terwijl Docker Desktop wel open staat, hangt de onderliggende VM. Sluit Docker Desktop volledig af (menubalk → Quit Docker Desktop) en start het opnieuw. Containers en images blijven bewaard.

## Kwaliteit
```bash
npm test
```
```bash
npm run typecheck
```
```bash
npm run compliance
```

## Omgevingsvariabelen API
| Variabele | Standaard | Productie |
|---|---|---|
| `NODE_ENV` | development | `production` (dwingt veilige instellingen af) |
| `DATABASE_URL` | leeg → PGlite | verplicht, met TLS |
| `APP_ORIGIN` | http://localhost:5188 | `https://…` van de web-app |
| `RP_ID` | localhost | domein van de web-app |
| `TRUST_PROXY` | uit | `cloudflare` (CF-Connecting-IP) of `1` (rechterste X-Forwarded-For van je eigen proxy) |
| `SESSION_TTL_HOURS` / `SESSION_IDLE_MINUTES` | 12 / 30 | idem |
