# QA-rapporten

Elke wijziging wordt beoordeeld door minimaal één **onafhankelijke reviewer-agent** met frisse context (zie `.claude/agents/`). De reviewer krijgt de letterlijke opdracht van de eigenaar en de code, en wijzigt zelf niets.

Per review één bestand: `JJJJ-MM-DD-<onderwerp>.md` met per bevinding: **ernst → besluit (opgelost / geaccepteerd / later) → fix of reden**.

| Datum | Onderwerp | Reviewers |
|---|---|---|
| 2026-10-12 | [Backend v0.1](2026-10-12-backend.md) | qa-reviewer, security-reviewer, verificatie |
| 2026-10-13 | [Lokale PostgreSQL-tests](2026-10-13-lokale-postgres-tests.md) | qa-reviewer |
| 2026-10-13 | [KERN web-wallet en Vercel-hosting](2026-10-13-web-wallet.md) | qa-, security-, design-reviewer (3 rondes) |
| 2026-10-14 | [Koopknop via partner, testaccount](2026-10-14-koopknop.md) | qa-, security-reviewer |
| 2026-10-14 | [GitHub-beveiliging, hosting, CI en CRA-alarm](2026-10-14-github-en-hosting.md) | security-reviewer |
| 2026-10-14 | [Versturen met een Ledger (testnet4)](2026-10-14-ledger-versturen.md) | qa-, security-, design-reviewer |
| 2026-10-14 | [Dependabot-PR's #4/#5 en cooldown](2026-10-14-dependabot.md) | security-reviewer |
