# API

- Basis: `/v1`, JSON, cookie-sessie (`ncw_session`, in productie `__Host-ncw_session`).
- Contract: [openapi.json](openapi.json), gegenereerd met `npm run openapi -w @ncw/api`. Open het in bijvoorbeeld Swagger Editor of Scalar.
- Elke wijzigende request moet de header `Origin` van de web-app hebben.

## Step-up (verse passkey-bevestiging)
Gevoelige acties vereisen een veld `stepUp: { challengeId, response }`. Haal eerst een challenge op met `POST /v1/auth/step-up/options { target }` en onderteken die met de passkey. Targets:

| Actie | Target |
|---|---|
| Goedkeuren / afwijzen | `proposal:<id>:approve` / `proposal:<id>:reject` |
| Uitnodigen | `org:<orgId>:invite` |
| Lid bevestigen / rol wijzigen / verwijderen | `org:<orgId>:member:<userId>:confirm` / `:role` / `:remove` |
| Kluis aanmaken | `org:<orgId>:vault:create` |
| Organisatiesleutels inpakken | `org:<orgId>:keys:wrap` |
| Voorstel annuleren | `proposal:<id>:cancel` |
| Uitnodiging intrekken | `org:<orgId>:invitation:<invitationId>:revoke` |
| Eigen encryptiesleutel registreren | `user:<userId>:encryption-key` |
| Passkey intrekken | `passkey:<credentialId>:delete` |

| Groep | Endpoints |
|---|---|
| Auth | `POST /v1/auth/register/options`, `/register/verify`, `/login/options`, `/login/verify`, `/logout`, `/step-up/options` |
| Account | `GET /v1/me`, `GET /v1/me/passkeys`, `POST /v1/me/passkeys/options`, `/verify`, `DELETE /v1/me/passkeys/{id}`, `POST /v1/me/sessions/revoke-others`, `PUT /v1/me/encryption-key` |
| Organisaties | `POST/GET /v1/orgs`, `GET /v1/orgs/{orgId}/members`, `POST/GET /v1/orgs/{orgId}/invitations`, `DELETE /v1/orgs/{orgId}/invitations/{id}`, `POST /v1/invitations/accept`, `POST /v1/orgs/{orgId}/members/{userId}/confirm`, `PATCH/DELETE /v1/orgs/{orgId}/members/{userId}` |
| Versleuteling | `GET /v1/orgs/{orgId}/encryption-keys`, `PUT /v1/orgs/{orgId}/wrapped-keys`, `GET /v1/orgs/{orgId}/wrapped-keys/me` |
| Kluizen | `POST/GET /v1/orgs/{orgId}/vaults`, `GET /v1/vaults/{vaultId}` |
| Goedkeuringen | `POST/GET /v1/vaults/{vaultId}/proposals`, `GET /v1/proposals/{id}`, `POST /v1/proposals/{id}/decisions`, `POST /v1/proposals/{id}/cancel` |
| Audit | `GET /v1/orgs/{orgId}/audit` (inclusief integriteitscontrole van de keten) |
| Systeem | `GET /health`, `GET /v1/openapi.json` |

Foutformaat: `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`.
