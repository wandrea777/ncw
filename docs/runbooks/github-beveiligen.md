# GitHub-repo beveiligen

De repository `wandrea777/ncw` is openbaar (open broncode, PLAN.md §5.3). Daardoor zijn branch protection en secret scanning gratis.

## Stand van zaken (14 oktober 2026)

| # | Maatregel | Status |
|---|---|---|
| 1 | **Account:** passkey of security key als 2FA, geen sms | ⏳ door de eigenaar zelf controleren (Settings → Password and authentication) |
| 2 | **Branch protection op `main`:** PR verplicht, check `ci` verplicht groen, geldt ook voor beheerders, geen force-push, niet verwijderen, lineaire historie, open review-gesprekken moeten opgelost zijn | ✅ aan |
| 3 | **Tag-rulesets op `v*`:** `release-tags-aanmaken` (alleen de beheerder mag een release-tag maken) en `release-tags-onveranderlijk` (niemand, ook de beheerder niet, mag een tag verplaatsen of verwijderen) | ✅ aan |
| 4 | **Ondertekende commits en tags:** `git config commit.gpgsign true` met een SSH-signing key (`git config gpg.format ssh`). Pas daarna *require signed commits* aanzetten, anders blokkeert het je eigen merges. | ⏳ eigenaar maakt een signing key |
| 5 | **Code security:** Dependabot alerts, Dependabot security updates, secret scanning, push protection, private vulnerability reporting | ✅ aan |
| 5a | Secret scanning voor niet-provider-patronen en validity checks | ➖ alleen met GitHub Advanced Security (betaald) |
| 6 | **Actions:** alleen actions van GitHub zelf, SHA-pinning verplicht, workflow-token standaard *read*, workflows mogen geen PR's goedkeuren | ✅ aan |
| 7 | **Secrets** (Vercel, later database en Stripe): alleen als secret in een environment met deployment branch policy en verplichte goedkeuring (`production`) | ✅ voor Vercel (zie [vercel-deploy.md](vercel-deploy.md)) |

## Controleren

```bash
gh api repos/wandrea777/ncw --jq .security_and_analysis
```
```bash
gh api repos/wandrea777/ncw/branches/main/protection --jq '{checks: .required_status_checks.contexts, admins: .enforce_admins.enabled}'
```
```bash
gh api repos/wandrea777/ncw/rulesets --jq '.[].name'
```
```bash
gh api repos/wandrea777/ncw/actions/permissions
```

## Gevolgen voor het werkproces

- Ook de eigenaar kan niet meer direct naar `main` pushen; alles gaat via een PR met groene CI (CLAUDE.md).
- Een nieuwe third-party action wordt geweigerd. Wil je er een gebruiken, voeg hem dan bewust toe onder Settings → Actions → *Allow specified actions*, vastgepind op een commit-SHA, met motivatie in de PR.
- Een verkeerde release-tag kun je niet verplaatsen of verwijderen. Maak een nieuwe patchversie.
