import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Deps } from "../app.ts";
import type { AppEnv } from "../auth/session.ts";
import { StepUp, requireStepUp, targets } from "../auth/stepup.ts";
import { appendAudit, orgChain, readChain, verifyChain } from "../lib/audit.ts";
import { CAN, requireRole } from "../lib/authz.ts";
import { newId, randomToken, sha256, sha256Hex } from "../lib/crypto.ts";
import { ApiError, conflict, isUniqueViolation, notFound } from "../lib/errors.ts";
import { recomputeOrgPending } from "../lib/proposals.ts";
import { KeyId, Role, Uuid, WrappedKey, body, errorResponses, fromB64, json, toB64 } from "../lib/schemas.ts";
import type { Db } from "../db/db.ts";

const INVITE_TTL_MS = 72 * 3_600_000;
const InviteRole = z.enum(["approver", "viewer"]).openapi({ description: "Eigenaarschap kan nooit via een uitnodiging worden gegeven." });
const Org = z.object({ id: Uuid, name: z.string(), role: Role }).openapi("Organization");
const Member = z
  .object({
    userId: Uuid,
    displayName: z.string(),
    role: Role,
    status: z.enum(["active", "pending"]),
    since: z.string(),
    safetyCode: z.string().nullable().openapi({ description: "Bij 'pending': vergelijk deze code telefonisch met het nieuwe lid vóór bevestiging." }),
  })
  .openapi("Member");
const OrgParam = z.object({ orgId: Uuid });
const MemberParams = z.object({ orgId: Uuid, userId: Uuid });
type R = "owner" | "approver" | "viewer";

/** 6-cijferige code die nieuw lid en eigenaar buiten de app vergelijken (tegen onderschepte uitnodigingen). */
export function safetyCode(invitationId: string, userId: string): string {
  const n = parseInt(sha256Hex(`ncw-safety:${invitationId}:${userId}`).slice(0, 8), 16) % 1_000_000;
  return n.toString().padStart(6, "0").replace(/(\d{3})(\d{3})/, "$1 $2");
}

async function ownerCount(tx: Db, orgId: string): Promise<number> {
  return (await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM memberships WHERE org_id = $1 AND role = 'owner' AND status = 'active'", [orgId]))[0]!.n;
}

export function registerOrgRoutes(app: OpenAPIHono<AppEnv>, { db, passkeys }: Deps) {
  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/orgs",
      tags: ["organisaties"],
      request: body(z.object({ name: z.string().trim().min(1).max(120) })),
      responses: { 201: json(Org, "Aangemaakt"), ...errorResponses },
    }),
    async (c) => {
      const { userId } = c.get("user");
      const { name } = c.req.valid("json");
      const id = newId();
      await db.transaction(async (tx) => {
        await tx.query("INSERT INTO organizations (id, name) VALUES ($1, $2)", [id, name]);
        await tx.query("INSERT INTO memberships (org_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')", [id, userId]);
        await appendAudit(tx, { chain: orgChain(id), actorId: userId, action: "org.created", target: `org:${id}` });
      });
      return c.json({ id, name, role: "owner" as const }, 201);
    },
  );

  app.openapi(
    createRoute({ method: "get", path: "/v1/orgs", tags: ["organisaties"], responses: { 200: json(z.array(Org)), ...errorResponses } }),
    async (c) => {
      const rows = await db.query<{ id: string; name: string; role: R }>(
        "SELECT o.id, o.name, m.role FROM memberships m JOIN organizations o ON o.id = m.org_id WHERE m.user_id = $1 AND m.status = 'active' ORDER BY o.created_at",
        [c.get("user").userId],
      );
      return c.json(rows, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/orgs/{orgId}/members",
      tags: ["organisaties"],
      request: { params: OrgParam },
      responses: { 200: json(z.array(Member)), ...errorResponses },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      const role = await requireRole(db, orgId, c.get("user").userId, CAN.read);
      const rows = await db.query<{ user_id: string; display_name: string; role: R; status: "active" | "pending"; created_at: Date; invitation_id: string | null }>(
        `SELECT m.user_id, u.display_name, m.role, m.status, m.created_at,
                (SELECT i.id FROM invitations i WHERE i.org_id = m.org_id AND i.accepted_by = m.user_id ORDER BY i.accepted_at DESC LIMIT 1) AS invitation_id
         FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = $1 ORDER BY m.created_at`,
        [orgId],
      );
      return c.json(
        rows.map((r) => ({
          userId: r.user_id,
          displayName: r.display_name,
          role: r.role,
          status: r.status,
          since: new Date(r.created_at).toISOString(),
          // Alleen eigenaren zien de veiligheidscode, en alleen bij leden die nog bevestigd moeten worden.
          safetyCode: role === "owner" && r.status === "pending" && r.invitation_id ? safetyCode(r.invitation_id, r.user_id) : null,
        })),
        200,
      );
    },
  );

  // ---------------------------------------------------------------- uitnodigingen
  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/orgs/{orgId}/invitations",
      tags: ["organisaties"],
      request: { params: OrgParam, ...body(z.object({ role: InviteRole, stepUp: StepUp })) },
      responses: { 201: json(z.object({ id: Uuid, code: z.string(), expiresAt: z.string() }), "Eenmalige uitnodigingscode (wordt maar één keer getoond)"), ...errorResponses },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      const { role, stepUp } = c.req.valid("json");
      const { userId } = c.get("user");
      await requireRole(db, orgId, userId, CAN.manage);
      await requireStepUp(db, passkeys, userId, targets.invite(orgId), stepUp);
      const code = randomToken();
      const id = newId();
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
      await db.transaction(async (tx) => {
        await tx.query("INSERT INTO invitations (id, org_id, role, code_hash, created_by, expires_at) VALUES ($1, $2, $3, $4, $5, $6)", [
          id,
          orgId,
          role,
          sha256(code),
          userId,
          expiresAt,
        ]);
        await appendAudit(tx, { chain: orgChain(orgId), actorId: userId, action: "invitation.created", target: `invitation:${id}`, details: { role } });
      });
      return c.json({ id, code, expiresAt: expiresAt.toISOString() }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/orgs/{orgId}/invitations",
      tags: ["organisaties"],
      request: { params: OrgParam },
      responses: {
        200: json(z.array(z.object({ id: Uuid, role: InviteRole, status: z.enum(["open", "accepted", "revoked", "expired"]), expiresAt: z.string() }))),
        ...errorResponses,
      },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      await requireRole(db, orgId, c.get("user").userId, CAN.manage);
      const rows = await db.query<{ id: string; role: "approver" | "viewer"; expires_at: Date; accepted_at: Date | null; revoked_at: Date | null }>(
        "SELECT id, role, expires_at, accepted_at, revoked_at FROM invitations WHERE org_id = $1 ORDER BY expires_at DESC LIMIT 100",
        [orgId],
      );
      const now = Date.now();
      return c.json(
        rows.map((r) => ({
          id: r.id,
          role: r.role,
          status: r.revoked_at ? ("revoked" as const) : r.accepted_at ? ("accepted" as const) : new Date(r.expires_at).getTime() < now ? ("expired" as const) : ("open" as const),
          expiresAt: new Date(r.expires_at).toISOString(),
        })),
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/v1/orgs/{orgId}/invitations/{invitationId}",
      tags: ["organisaties"],
      request: { params: z.object({ orgId: Uuid, invitationId: Uuid }), ...body(z.object({ stepUp: StepUp })) },
      responses: { 204: { description: "Ingetrokken" }, ...errorResponses },
    }),
    async (c) => {
      const { orgId, invitationId } = c.req.valid("param");
      const { stepUp } = c.req.valid("json");
      const { userId } = c.get("user");
      await requireRole(db, orgId, userId, CAN.manage);
      await requireStepUp(db, passkeys, userId, targets.revokeInvite(orgId, invitationId), stepUp);
      await db.transaction(async (tx) => {
        const r = await tx.query("UPDATE invitations SET revoked_at = now() WHERE id = $1 AND org_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING 1", [
          invitationId,
          orgId,
        ]);
        if (!r.length) throw notFound();
        await appendAudit(tx, { chain: orgChain(orgId), actorId: userId, action: "invitation.revoked", target: `invitation:${invitationId}` });
      });
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/invitations/accept",
      tags: ["organisaties"],
      summary: "Uitnodiging accepteren. Het lidmaatschap blijft 'pending' tot een eigenaar het bevestigt na vergelijking van de veiligheidscode.",
      request: body(z.object({ code: z.string().min(10).max(128) })),
      responses: { 200: json(z.object({ orgId: Uuid, orgName: z.string(), role: InviteRole, status: z.literal("pending"), safetyCode: z.string() })), ...errorResponses },
    }),
    async (c) => {
      const { code } = c.req.valid("json");
      const { userId } = c.get("user");
      const result = await db.transaction(async (tx) => {
        const inv = (
          await tx.query<{ id: string; org_id: string; role: "approver" | "viewer"; name: string }>(
            `SELECT i.id, i.org_id, i.role, o.name FROM invitations i JOIN organizations o ON o.id = i.org_id
             WHERE i.code_hash = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now() FOR UPDATE OF i`,
            [sha256(code)],
          )
        )[0];
        if (!inv) throw new ApiError(410, "invitation_invalid", "Uitnodiging ongeldig, gebruikt, ingetrokken of verlopen.");
        try {
          await tx.query("INSERT INTO memberships (org_id, user_id, role, status) VALUES ($1, $2, $3, 'pending')", [inv.org_id, userId, inv.role]);
        } catch (e) {
          if (isUniqueViolation(e)) throw conflict("Je bent al lid van deze organisatie.");
          throw e;
        }
        await tx.query("UPDATE invitations SET accepted_by = $2, accepted_at = now() WHERE id = $1", [inv.id, userId]);
        await appendAudit(tx, { chain: orgChain(inv.org_id), actorId: userId, action: "member.requested", target: `user:${userId}`, details: { role: inv.role } });
        return { orgId: inv.org_id, orgName: inv.name, role: inv.role, status: "pending" as const, safetyCode: safetyCode(inv.id, userId) };
      });
      return c.json(result, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/orgs/{orgId}/members/{userId}/confirm",
      tags: ["organisaties"],
      request: { params: MemberParams, ...body(z.object({ stepUp: StepUp })) },
      responses: { 200: json(Member), ...errorResponses },
    }),
    async (c) => {
      const { orgId, userId: target } = c.req.valid("param");
      const { stepUp } = c.req.valid("json");
      const actor = c.get("user").userId;
      await requireRole(db, orgId, actor, CAN.manage);
      await requireStepUp(db, passkeys, actor, targets.confirmMember(orgId, target), stepUp);
      const m = await db.transaction(async (tx) => {
        const [row] = await tx.query<{ role: R; display_name: string; created_at: Date }>(
          `UPDATE memberships m SET status = 'active' FROM users u
           WHERE m.org_id = $1 AND m.user_id = $2 AND m.status = 'pending' AND u.id = m.user_id
           RETURNING m.role, u.display_name, m.created_at`,
          [orgId, target],
        );
        if (!row) throw notFound();
        await appendAudit(tx, { chain: orgChain(orgId), actorId: actor, action: "member.confirmed", target: `user:${target}`, details: { role: row.role } });
        await recomputeOrgPending(tx, orgId);
        return { userId: target, displayName: row.display_name, role: row.role, status: "active" as const, since: new Date(row.created_at).toISOString(), safetyCode: null };
      });
      return c.json(m, 200);
    },
  );

  // ---------------------------------------------------------------- rollen en verwijderen
  app.openapi(
    createRoute({
      method: "patch",
      path: "/v1/orgs/{orgId}/members/{userId}",
      tags: ["organisaties"],
      request: { params: MemberParams, ...body(z.object({ role: Role, stepUp: StepUp })) },
      responses: { 200: json(Member), ...errorResponses },
    }),
    async (c) => {
      const { orgId, userId: target } = c.req.valid("param");
      const { role, stepUp } = c.req.valid("json");
      const actor = c.get("user").userId;
      await requireRole(db, orgId, actor, CAN.manage);
      await requireStepUp(db, passkeys, actor, targets.changeRole(orgId, target), stepUp);
      const member = await db.transaction(async (tx) => {
        await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`members:${orgId}`]);
        await requireRole(tx, orgId, actor, CAN.manage);
        const cur = (
          await tx.query<{ role: R; display_name: string; created_at: Date }>(
            "SELECT m.role, u.display_name, m.created_at FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = $1 AND m.user_id = $2 AND m.status = 'active'",
            [orgId, target],
          )
        )[0];
        if (!cur) throw notFound();
        if (cur.role === "owner" && role !== "owner" && (await ownerCount(tx, orgId)) <= 1) throw conflict("Een organisatie heeft minimaal één eigenaar nodig.");
        await tx.query("UPDATE memberships SET role = $3 WHERE org_id = $1 AND user_id = $2", [orgId, target, role]);
        await appendAudit(tx, { chain: orgChain(orgId), actorId: actor, action: "member.role_changed", target: `user:${target}`, details: { from: cur.role, to: role } });
        await recomputeOrgPending(tx, orgId);
        return { userId: target, displayName: cur.display_name, role, status: "active" as const, since: new Date(cur.created_at).toISOString(), safetyCode: null };
      });
      return c.json(member, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/v1/orgs/{orgId}/members/{userId}",
      tags: ["organisaties"],
      request: { params: MemberParams, ...body(z.object({ stepUp: StepUp })) },
      responses: { 204: { description: "Verwijderd" }, ...errorResponses },
    }),
    async (c) => {
      const { orgId, userId: target } = c.req.valid("param");
      const { stepUp } = c.req.valid("json");
      const actor = c.get("user").userId;
      // Iedereen mag zichzelf verwijderen (ook als lidmaatschap nog 'pending' is); anderen alleen een eigenaar.
      // Altijd met passkey-bevestiging.
      const self = actor === target;
      const ownMembership = async (q: Db) =>
        (await q.query("SELECT 1 FROM memberships WHERE org_id = $1 AND user_id = $2", [orgId, actor])).length > 0;
      if (self) {
        if (!(await ownMembership(db))) throw notFound();
      } else await requireRole(db, orgId, actor, CAN.manage);
      await requireStepUp(db, passkeys, actor, targets.removeMember(orgId, target), stepUp);
      await db.transaction(async (tx) => {
        await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`members:${orgId}`]);
        if (!self) await requireRole(tx, orgId, actor, CAN.manage);
        const cur = (await tx.query<{ role: R }>("SELECT role FROM memberships WHERE org_id = $1 AND user_id = $2", [orgId, target]))[0];
        if (!cur) throw notFound();
        if (cur.role === "owner" && (await ownerCount(tx, orgId)) <= 1) throw conflict("De laatste eigenaar kan niet worden verwijderd.");
        await tx.query("DELETE FROM memberships WHERE org_id = $1 AND user_id = $2", [orgId, target]);
        await tx.query("DELETE FROM wrapped_org_keys WHERE org_id = $1 AND user_id = $2", [orgId, target]);
        // Stemmen op openstaande voorstellen vervallen definitief (herleven niet bij een latere heruitnodiging).
        await tx.query(
          `DELETE FROM approvals a USING proposals p, vaults v
           WHERE a.proposal_id = p.id AND p.vault_id = v.id AND v.org_id = $1 AND p.status = 'pending' AND a.user_id = $2`,
          [orgId, target],
        );
        await appendAudit(tx, { chain: orgChain(orgId), actorId: actor, action: "member.removed", target: `user:${target}` });
        await recomputeOrgPending(tx, orgId);
      });
      return c.body(null, 204);
    },
  );

  // ---------------------------------------------------------------- E2EE: sleuteldistributie
  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/orgs/{orgId}/encryption-keys",
      tags: ["versleuteling"],
      summary: "Publieke sleutels van actieve leden. Controleer vingerafdrukken buiten de app; de server kan sleutels anders verwisselen.",
      request: { params: OrgParam },
      responses: { 200: json(z.array(z.object({ userId: Uuid, alg: z.literal("x25519"), publicKey: z.string() }))), ...errorResponses },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      await requireRole(db, orgId, c.get("user").userId, CAN.read);
      const rows = await db.query<{ user_id: string; public_key: Uint8Array }>(
        "SELECT k.user_id, k.public_key FROM user_encryption_keys k JOIN memberships m ON m.user_id = k.user_id WHERE m.org_id = $1 AND m.status = 'active'",
        [orgId],
      );
      return c.json(rows.map((r) => ({ userId: r.user_id, alg: "x25519" as const, publicKey: toB64(r.public_key)! })), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/v1/orgs/{orgId}/wrapped-keys",
      tags: ["versleuteling"],
      summary: "Organisatiesleutel per lid ingepakt (sealed box) opslaan. Alleen eigenaren.",
      request: {
        params: OrgParam,
        ...body(z.object({ keyId: KeyId, entries: z.array(z.object({ userId: Uuid, wrappedKey: WrappedKey })).min(1).max(50), stepUp: StepUp })),
      },
      responses: { 200: json(z.object({ stored: z.number().int() })), ...errorResponses },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      const { keyId, entries, stepUp } = c.req.valid("json");
      const actor = c.get("user").userId;
      await requireRole(db, orgId, actor, CAN.manage);
      await requireStepUp(db, passkeys, actor, targets.wrapKeys(orgId), stepUp);
      await db.transaction(async (tx) => {
        const active = new Set(
          (await tx.query<{ user_id: string }>("SELECT user_id FROM memberships WHERE org_id = $1 AND status = 'active'", [orgId])).map((r) => r.user_id),
        );
        for (const e of entries) {
          if (!active.has(e.userId)) throw new ApiError(400, "not_a_member", "Sleutels kunnen alleen voor actieve leden worden ingepakt.");
          await tx.query(
            `INSERT INTO wrapped_org_keys (org_id, key_id, user_id, wrapped_key, wrapped_by) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (org_id, key_id, user_id) DO UPDATE SET wrapped_key = EXCLUDED.wrapped_key, wrapped_by = EXCLUDED.wrapped_by, created_at = now()`,
            [orgId, keyId, e.userId, fromB64(e.wrappedKey), actor],
          );
        }
        await appendAudit(tx, { chain: orgChain(orgId), actorId: actor, action: "keys.wrapped", details: { keyId, members: entries.length } });
      });
      return c.json({ stored: entries.length }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/orgs/{orgId}/wrapped-keys/me",
      tags: ["versleuteling"],
      request: { params: OrgParam },
      responses: { 200: json(z.array(z.object({ keyId: z.string(), wrappedKey: z.string(), wrappedBy: Uuid }))), ...errorResponses },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      const { userId } = c.get("user");
      await requireRole(db, orgId, userId, CAN.read);
      const rows = await db.query<{ key_id: string; wrapped_key: Uint8Array; wrapped_by: string }>(
        "SELECT key_id, wrapped_key, wrapped_by FROM wrapped_org_keys WHERE org_id = $1 AND user_id = $2 ORDER BY created_at",
        [orgId, userId],
      );
      return c.json(rows.map((r) => ({ keyId: r.key_id, wrappedKey: toB64(r.wrapped_key)!, wrappedBy: r.wrapped_by })), 200);
    },
  );

  // ---------------------------------------------------------------- audit
  const AuditRow = z
    .object({ seq: z.number(), actorId: Uuid.nullable(), action: z.string(), target: z.string().nullable(), details: z.record(z.string(), z.unknown()), createdAt: z.string(), hash: z.string() })
    .openapi("AuditEntry");

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/orgs/{orgId}/audit",
      tags: ["audit"],
      summary: "Auditlog + integriteit. Bewaar `integrity.head` buiten de app: zo is ook herschrijven van de hele keten aantoonbaar.",
      request: { params: OrgParam },
      responses: {
        200: json(
          z.object({
            entries: z.array(AuditRow),
            integrity: z.object({ ok: z.boolean(), brokenAt: z.number().nullable(), count: z.number(), head: z.string().nullable() }),
          }),
        ),
        ...errorResponses,
      },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      await requireRole(db, orgId, c.get("user").userId, CAN.read);
      const chain = await readChain(db, orgChain(orgId));
      return c.json(
        {
          entries: chain.slice(-500).map((e) => ({ seq: e.seq, actorId: e.actor_id, action: e.action, target: e.target, details: e.details, createdAt: e.created_at, hash: e.hash })),
          integrity: { ...verifyChain(chain), head: chain.at(-1)?.hash ?? null },
        },
        200,
      );
    },
  );
}
