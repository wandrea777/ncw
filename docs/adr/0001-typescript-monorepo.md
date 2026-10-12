# ADR-0001: TypeScript-monorepo

- **Status:** Aangenomen · 2026-10-12
- **Context:** één ontwikkelaar (student) met Claude; web, API en straks mobiel delen logica (box 3-berekening, adresvalidatie).
- **Besluit:** npm workspaces met `packages/core`, `apps/web` en `apps/api`, allemaal TypeScript. De API draait TypeScript direct met Node (type stripping), zonder bundler.
- **Alternatieven:** Python/Go-backend (twee talen = dubbel onderhoud); losse repo's (synchronisatieproblemen).
- **Gevolgen:** één taal, gedeelde types en één CI. Node-type-stripping verbiedt TS-features zonder JS-equivalent (`enum`, parameter properties); `erasableSyntaxOnly` in tsconfig bewaakt dat.
