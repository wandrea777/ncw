# Werkafspraken voor Claude in deze repo

Deze afspraken gelden voor elke sessie. Ze komen rechtstreeks van de eigenaar en hebben voorrang op standaardgedrag.

## Taal en toon
- Communiceer in het **Nederlands**. Code-identifiers mogen Engels zijn; teksten voor gebruikers en documentatie zijn Nederlands.

## Git
- **Nooit** `Co-Authored-By: Claude`-regels in commits en **nooit** "Generated with Claude Code" in PR's of andere bestanden. De eigenaar is de enige auteur.
- Commit of push alleen als de eigenaar daarom vraagt. Werk op een branch en merge via een PR met groene CI.
- Commitberichten in het Nederlands, in de gebiedende wijs ("Voeg passkey-login toe").

## Werkproces per wijziging (verplicht)
1. **Begrijp de vraag**: herformuleer de opdracht in je eigen woorden en noem aannames.
2. **Bouw** met tests. Elke rekenregel, autorisatieregel en beveiligingsmaatregel heeft een test.
3. **Onafhankelijke QA**: start minimaal één reviewer-agent met frisse context (zie `.claude/agents/`):
   - `qa-reviewer`: krijgt de **letterlijke opdracht van de eigenaar** + de diff, en controleert of de opdracht is uitgevoerd, op bugs en op testkwaliteit;
   - `security-reviewer`: bij elke wijziging aan auth, autorisatie, crypto, data-opslag, dependencies of CI.
   De reviewer wijzigt niets en rapporteert alleen. Verwerk de bevindingen en leg ze vast in `docs/qa/JJJJ-MM-DD-<onderwerp>.md` (bevinding → besluit → fix/reden).
4. **Documenteer** in dezelfde wijziging:
   - `CHANGELOG.md` (sectie *Onvoltooid*);
   - een ADR in `docs/adr/` bij elke architectuur- of beveiligingskeuze;
   - de relevante pagina in `docs/` (architectuur, API, security, runbooks);
   - `compliance/register.yaml` als een wet of control wordt geraakt;
   - `docs/api/openapi.json` opnieuw genereren als de API verandert (`npm run openapi -w @ncw/api`).
5. **Verifieer**: `npm test`, `npm run typecheck`, `npm run compliance`, plus de app echt draaien als het zichtbaar is.

## Niet-onderhandelbare principes
- **Non-custodial**: het bedrijf bewaart nooit privésleutels of sleuteldelen en kan nooit zelf geld verplaatsen. Twijfel → stoppen en voorleggen (MiCA-perimeter, control MICA-2).
- **Zero-knowledge**: descriptors, xpubs, adressen, PSBT's en handtekeningen alleen als client-side ciphertext op de server. Nooit in logs of het auditlog.
- **Alleen groene verdienmodellen**: geen eigen fee in transacties, geen staking-commissie.
- **Security boven gemak**: passkeys only, geen wachtwoorden of sms. Minimale dependencies. Geen eigen cryptografie; alleen bewezen bibliotheken. Elke nieuwe dependency krijgt een motivatie in de PR.
- **Geen marketingclaims** zoals "veiligste" of "100% veilig" in de app. Copy-lint dwingt dit af. Beveiliging laten we zien met feiten (audit, pentest-rapport, open broncode).

## Structuur
| Pad | Inhoud |
|---|---|
| `apps/api` | Backend (Hono + PostgreSQL), zie `docs/architecture/overview.md` |
| `apps/web` | Web-app (Vite + React) |
| `packages/core` | Gedeelde rekenkern |
| `compliance/` | Register, checks, CRA-incidentbeheer |
| `docs/` | Alle documentatie (index: `docs/README.md`) |

## Commando's
```bash
npm test
```
```bash
npm run typecheck
```
```bash
npm run compliance
```
```bash
npm run dev:api
```
