import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Deps } from "../app.ts";
import type { AppEnv } from "../auth/session.ts";
import { createSession, requireSession, revokeSession } from "../auth/session.ts";
import { StepUp, StepUpTarget, WebAuthnResponse, requireStepUp, targets, verifyAssertion } from "../auth/stepup.ts";
import { appendAudit, SYSTEM_CHAIN } from "../lib/audit.ts";
import { newId } from "../lib/crypto.ts";
import { ApiError, conflict, isUniqueViolation, notFound } from "../lib/errors.ts";
import { PublicKey32, Role, Uuid, body, errorResponses, fromB64, json, toB64 } from "../lib/schemas.ts";
import type { Db } from "../db/db.ts";

const CHALLENGE_TTL_MS = 2 * 60_000;
const OptionsResponse = z.object({ challengeId: Uuid, options: z.record(z.string(), z.unknown()) });
const User = z.object({ id: Uuid, displayName: z.string() }).openapi("User");
const Passkey = z
  .object({ credentialId: z.string(), deviceType: z.string(), backedUp: z.boolean(), createdAt: z.string(), lastUsedAt: z.string().nullable() })
  .openapi("Passkey");

/** Ruimt verlopen challenges en sessies op. Goedkoop dankzij indexen; draait mee met auth-verzoeken. */
async function cleanup(db: Db) {
  await db.query("DELETE FROM webauthn_challenges WHERE expires_at < now()");
  await db.query("DELETE FROM sessions WHERE expires_at < now() - interval '1 day'");
}

async function storeChallenge(db: Db, purpose: string, challenge: string, extra: { userId?: string; displayName?: string; target?: string } = {}) {
  const id = newId();
  await db.query(
    "INSERT INTO webauthn_challenges (id, purpose, challenge, user_id, display_name, target, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [id, purpose, challenge, extra.userId ?? null, extra.displayName ?? null, extra.target ?? null, new Date(Date.now() + CHALLENGE_TTL_MS)],
  );
  return id;
}

async function takeChallenge(db: Db, id: string, purpose: string, userId?: string) {
  const row = (
    await db.query<{ challenge: string; user_id: string | null; display_name: string | null }>(
      `DELETE FROM webauthn_challenges WHERE id = $1 AND purpose = $2 AND expires_at > now() ${userId ? "AND user_id = $3" : ""}
       RETURNING challenge, user_id, display_name`,
      userId ? [id, purpose, userId] : [id, purpose],
    )
  )[0];
  if (!row) throw new ApiError(400, "challenge_invalid", "Verlopen of onbekende challenge. Probeer opnieuw.");
  return row;
}

export function registerAuthRoutes(app: OpenAPIHono<AppEnv>, { db, cfg, passkeys }: Deps) {
  async function storePasskey(tx: Db, userId: string, reg: Awaited<ReturnType<typeof passkeys.verifyRegistration>>) {
    try {
      await tx.query(
        `INSERT INTO passkeys (credential_id, user_id, public_key, counter, transports, device_type, backed_up)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [reg.credentialId, userId, Buffer.from(reg.publicKey), reg.counter, reg.transports, reg.deviceType, reg.backedUp],
      );
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict("Deze passkey is al geregistreerd.");
      throw e;
    }
  }

  async function verifyReg(response: unknown, challenge: string) {
    try {
      return await passkeys.verifyRegistration({ response, challenge });
    } catch {
      throw new ApiError(400, "passkey_invalid", "Passkey kon niet worden geverifieerd.");
    }
  }

  // ---------------------------------------------------------------- registratie
  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/auth/register/options",
      tags: ["auth"],
      request: body(z.object({ displayName: z.string().trim().min(1).max(80) })),
      responses: { 200: json(OptionsResponse), ...errorResponses },
    }),
    async (c) => {
      const { displayName } = c.req.valid("json");
      await cleanup(db);
      const userId = newId();
      const { challenge, options } = await passkeys.registrationOptions({ userId, displayName });
      const challengeId = await storeChallenge(db, "register", challenge, { userId, displayName });
      return c.json({ challengeId, options: options as Record<string, unknown> }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/auth/register/verify",
      tags: ["auth"],
      request: body(z.object({ challengeId: Uuid, response: WebAuthnResponse })),
      responses: { 200: json(z.object({ user: User })), ...errorResponses },
    }),
    async (c) => {
      const { challengeId, response } = c.req.valid("json");
      const ch = await takeChallenge(db, challengeId, "register");
      const reg = await verifyReg(response, ch.challenge);
      const userId = ch.user_id!;
      await db.transaction(async (tx) => {
        await tx.query("INSERT INTO users (id, display_name) VALUES ($1, $2)", [userId, ch.display_name]);
        await storePasskey(tx, userId, reg);
        await appendAudit(tx, { chain: SYSTEM_CHAIN, actorId: userId, action: "user.registered", target: `user:${userId}` });
      });
      await createSession(db, cfg, c, userId);
      return c.json({ user: { id: userId, displayName: ch.display_name! } }, 200);
    },
  );

  // ---------------------------------------------------------------- inloggen
  app.openapi(
    createRoute({ method: "post", path: "/v1/auth/login/options", tags: ["auth"], responses: { 200: json(OptionsResponse), ...errorResponses } }),
    async (c) => {
      await cleanup(db);
      const { challenge, options } = await passkeys.authenticationOptions();
      const challengeId = await storeChallenge(db, "login", challenge);
      return c.json({ challengeId, options: options as Record<string, unknown> }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/auth/login/verify",
      tags: ["auth"],
      request: body(z.object({ challengeId: Uuid, response: WebAuthnResponse })),
      responses: { 200: json(z.object({ user: User })), ...errorResponses },
    }),
    async (c) => {
      const { challengeId, response } = c.req.valid("json");
      const ch = await takeChallenge(db, challengeId, "login");
      const { userId } = await verifyAssertion(db, passkeys, { response, challenge: ch.challenge });
      await db.transaction((tx) => appendAudit(tx, { chain: SYSTEM_CHAIN, actorId: userId, action: "auth.login", target: `user:${userId}` }));
      await createSession(db, cfg, c, userId);
      const [u] = await db.query<{ display_name: string }>("SELECT display_name FROM users WHERE id = $1", [userId]);
      return c.json({ user: { id: userId, displayName: u!.display_name } }, 200);
    },
  );

  // ---------------------------------------------------------------- alles hieronder: ingelogd
  for (const p of ["/v1/auth/logout", "/v1/auth/step-up/*", "/v1/me", "/v1/me/*"]) app.use(p, requireSession(db, cfg));

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/auth/logout",
      tags: ["auth"],
      summary: "Uitloggen. Beëindigt de sessie en wist de sessiecookie (Clear-Site-Data: \"cookies\"); lokale opslag blijft staan.",
      responses: { 204: { description: "Uitgelogd" }, ...errorResponses },
    }),
    async (c) => {
      await revokeSession(db, cfg, c, c.get("user").sessionId);
      // Alleen cookies: de web-app bewaart gevolgde publieke adressen lokaal (ADR-0013). Wissen van het apparaat is
      // een aparte, expliciete keuze van de gebruiker ("Uitloggen en dit apparaat wissen").
      c.header("Clear-Site-Data", '"cookies"');
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/auth/step-up/options",
      tags: ["auth"],
      summary: "Challenge voor een verse passkey-bevestiging van één specifieke actie (target)",
      request: body(z.object({ target: StepUpTarget })),
      responses: { 200: json(OptionsResponse), ...errorResponses },
    }),
    async (c) => {
      const { target } = c.req.valid("json");
      const { userId } = c.get("user");
      await cleanup(db);
      const ids = (await db.query<{ credential_id: string }>("SELECT credential_id FROM passkeys WHERE user_id = $1", [userId])).map((r) => r.credential_id);
      const { challenge, options } = await passkeys.authenticationOptions({ allowCredentialIds: ids });
      const challengeId = await storeChallenge(db, "stepup", challenge, { userId, target });
      return c.json({ challengeId, options: options as Record<string, unknown> }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/me",
      tags: ["account"],
      responses: {
        200: json(
          z.object({
            user: User,
            passkeys: z.number().int(),
            organizations: z.array(z.object({ id: Uuid, name: z.string(), role: Role, status: z.enum(["active", "pending"]) })),
          }),
        ),
        ...errorResponses,
      },
    }),
    async (c) => {
      const { userId } = c.get("user");
      const [u] = await db.query<{ id: string; display_name: string }>("SELECT id, display_name FROM users WHERE id = $1", [userId]);
      const [pkCount] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM passkeys WHERE user_id = $1", [userId]);
      const orgs = await db.query<{ id: string; name: string; role: "owner" | "approver" | "viewer"; status: "active" | "pending" }>(
        "SELECT o.id, o.name, m.role, m.status FROM memberships m JOIN organizations o ON o.id = m.org_id WHERE m.user_id = $1 ORDER BY o.created_at",
        [userId],
      );
      return c.json({ user: { id: u!.id, displayName: u!.display_name }, passkeys: pkCount!.n, organizations: orgs }, 200);
    },
  );

  // ---------------------------------------------------------------- passkeybeheer
  app.openapi(
    createRoute({ method: "get", path: "/v1/me/passkeys", tags: ["account"], responses: { 200: json(z.array(Passkey)), ...errorResponses } }),
    async (c) => {
      const rows = await db.query<{ credential_id: string; device_type: string; backed_up: boolean; created_at: Date; last_used_at: Date | null }>(
        "SELECT credential_id, device_type, backed_up, created_at, last_used_at FROM passkeys WHERE user_id = $1 ORDER BY created_at",
        [c.get("user").userId],
      );
      return c.json(
        rows.map((r) => ({
          credentialId: r.credential_id,
          deviceType: r.device_type,
          backedUp: r.backed_up,
          createdAt: new Date(r.created_at).toISOString(),
          lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
        })),
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/me/passkeys/options",
      tags: ["account"],
      summary: "Extra passkey toevoegen (bijv. een YubiKey als reserve)",
      responses: { 200: json(OptionsResponse), ...errorResponses },
    }),
    async (c) => {
      const { userId } = c.get("user");
      const [u] = await db.query<{ display_name: string }>("SELECT display_name FROM users WHERE id = $1", [userId]);
      const existing = (await db.query<{ credential_id: string }>("SELECT credential_id FROM passkeys WHERE user_id = $1", [userId])).map((r) => r.credential_id);
      if (existing.length >= 10) throw conflict("Maximaal 10 passkeys per gebruiker.");
      const { challenge, options } = await passkeys.registrationOptions({ userId, displayName: u!.display_name, excludeCredentialIds: existing });
      const challengeId = await storeChallenge(db, "add_passkey", challenge, { userId });
      return c.json({ challengeId, options: options as Record<string, unknown> }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/me/passkeys/verify",
      tags: ["account"],
      request: body(z.object({ challengeId: Uuid, response: WebAuthnResponse })),
      responses: { 201: json(z.object({ credentialId: z.string() }), "Toegevoegd"), ...errorResponses },
    }),
    async (c) => {
      const { challengeId, response } = c.req.valid("json");
      const { userId } = c.get("user");
      const ch = await takeChallenge(db, challengeId, "add_passkey", userId);
      const reg = await verifyReg(response, ch.challenge);
      await db.transaction(async (tx) => {
        await storePasskey(tx, userId, reg);
        await appendAudit(tx, { chain: SYSTEM_CHAIN, actorId: userId, action: "passkey.added", target: `passkey:${reg.credentialId}` });
      });
      return c.json({ credentialId: reg.credentialId }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/v1/me/passkeys/{credentialId}",
      tags: ["account"],
      request: { params: z.object({ credentialId: z.string().min(1).max(1024) }), ...body(z.object({ stepUp: StepUp })) },
      responses: { 204: { description: "Ingetrokken" }, ...errorResponses },
    }),
    async (c) => {
      const { credentialId } = c.req.valid("param");
      const { stepUp } = c.req.valid("json");
      const { userId } = c.get("user");
      await requireStepUp(db, passkeys, userId, targets.deletePasskey(credentialId), stepUp);
      await db.transaction(async (tx) => {
        await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`passkeys:${userId}`]);
        const n = (await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM passkeys WHERE user_id = $1", [userId]))[0]!.n;
        if (n <= 1) throw conflict("Je laatste passkey kan niet worden verwijderd. Voeg eerst een andere toe.");
        const del = await tx.query("DELETE FROM passkeys WHERE credential_id = $1 AND user_id = $2 RETURNING 1", [credentialId, userId]);
        if (!del.length) throw notFound();
        await appendAudit(tx, { chain: SYSTEM_CHAIN, actorId: userId, action: "passkey.removed", target: `passkey:${credentialId}` });
      });
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/me/sessions/revoke-others",
      tags: ["account"],
      summary: "Alle andere sessies beëindigen (bijv. na verlies van een apparaat)",
      responses: { 200: json(z.object({ revoked: z.number().int() })), ...errorResponses },
    }),
    async (c) => {
      const { userId, sessionId } = c.get("user");
      const rows = await db.query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL RETURNING 1", [userId, sessionId]);
      await db.transaction((tx) => appendAudit(tx, { chain: SYSTEM_CHAIN, actorId: userId, action: "sessions.revoked_others", details: { count: rows.length } }));
      return c.json({ revoked: rows.length }, 200);
    },
  );

  // ---------------------------------------------------------------- publieke encryptiesleutel (E2EE)
  app.openapi(
    createRoute({
      method: "put",
      path: "/v1/me/encryption-key",
      tags: ["account"],
      summary: "Publieke X25519-sleutel registreren (eenmalig). Andere leden pakken de organisatiesleutel hiermee voor je in.",
      request: body(z.object({ alg: z.literal("x25519"), publicKey: PublicKey32, stepUp: StepUp })),
      responses: { 201: json(z.object({ publicKey: z.string() }), "Geregistreerd"), ...errorResponses },
    }),
    async (c) => {
      const { alg, publicKey, stepUp } = c.req.valid("json");
      const { userId } = c.get("user");
      // Step-up: anders kan iemand met een gestolen sessie zijn eigen sleutel registreren en zo de organisatiesleutel ontvangen.
      await requireStepUp(db, passkeys, userId, targets.registerEncryptionKey(userId), stepUp);
      try {
        await db.transaction(async (tx) => {
          await tx.query("INSERT INTO user_encryption_keys (user_id, alg, public_key) VALUES ($1, $2, $3)", [userId, alg, fromB64(publicKey)]);
          await appendAudit(tx, { chain: SYSTEM_CHAIN, actorId: userId, action: "encryption_key.registered" });
        });
      } catch (e) {
        if (isUniqueViolation(e)) throw conflict("Er is al een encryptiesleutel geregistreerd (rotatie volgt in een latere versie).");
        throw e;
      }
      return c.json({ publicKey: toB64(fromB64(publicKey))! }, 201);
    },
  );
}
