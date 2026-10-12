# GitHub-repo beveiligen (eenmalig)

1. **Account:** passkey of security key als 2FA; geen sms.
2. **Repo private**, standaardbranch `main`.
3. **Branch protection / ruleset op `main`** (bij een gratis account alleen voor publieke repo's; voor een private repo is GitHub Pro nodig, ± €4/maand): PR verplicht, CI verplicht groen, geen force-push, geen verwijderen, *require signed commits*, *require linear history*.
4. **Signed commits:** `git config commit.gpgsign true` met een SSH-signing key (`git config gpg.format ssh`).
5. **Settings → Code security:** Dependabot alerts + security updates aan (gratis). Secret scanning met push protection is voor private repo's een betaalde functie; tot die tijd scannen we lokaal vóór elke commit.
6. **Actions:** "Allow only actions created by GitHub and selected", workflow-permissies standaard *read*.
7. **Secrets** (Cloudflare, database): alleen als Actions-secrets of in een environment met verplichte goedkeuring (`production`).
