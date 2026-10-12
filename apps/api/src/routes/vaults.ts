import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Deps } from "../app.ts";
import type { AppEnv } from "../auth/session.ts";
import { StepUp, requireStepUp, targets } from "../auth/stepup.ts";
import { appendAudit, orgChain } from "../lib/audit.ts";
import { CAN, orgOfProposal, orgOfVault, requireRole } from "../lib/authz.ts";
import { newId } from "../lib/crypto.ts";
import { ApiError, conflict, forbidden } from "../lib/errors.ts";
import { recomputeProposal } from "../lib/proposals.ts";
import { Ciphertext, Encryption, Uuid, body, errorResponses, fromB64, json, toB64 } from "../lib/schemas.ts";
import type { Db } from "../db/db.ts";

const Chain = z.enum(["bitcoin", "ethereum"]);
const Vault = z
  .object({
    id: Uuid,
    orgId: Uuid,
    chain: Chain,
    threshold: z.number().int(),
    signerCount: z.number().int(),
    signers: z.array(z.object({ position: z.number().int(), userId: Uuid })),
    descriptorCiphertext: Ciphertext,
    encryption: Encryption,
    createdBy: Uuid,
    createdAt: z.string(),
  })
  .openapi("Vault");

const Status = z.enum(["pending", "approved", "rejected", "cancelled"]);
const Decision = z.object({ userId: Uuid, decision: z.enum(["approve", "reject"]), signatureCiphertext: Ciphertext.nullable(), createdAt: z.string() });
const Proposal = z
  .object({
    id: Uuid,
    vaultId: Uuid,
    createdBy: Uuid,
    status: Status,
    requiredApprovals: z.number().int().openapi({ description: "Drempel in aantal sleutels" }),
    payloadCiphertext: Ciphertext,
    encryption: Encryption,
    createdAt: z.string(),
    decidedAt: z.string().nullable(),
    decisions: z.array(Decision),
  })
  .openapi("Proposal");

type VaultRow = { id: string; org_id: string; chain: "bitcoin" | "ethereum"; threshold: number; signer_count: number; descriptor_ciphertext: Uint8Array; encryption: z.infer<typeof Encryption>; created_by: string; created_at: Date };
type ProposalRow = { id: string; vault_id: string; created_by: string; status: z.infer<typeof Status>; required_approvals: number; payload_ciphertext: Uint8Array; encryption: z.infer<typeof Encryption>; created_at: Date; decided_at: Date | null };
type DecisionRow = { proposal_id: string; user_id: string; decision: "approve" | "reject"; signature_ciphertext: Uint8Array | null; created_at: Date };
type SignerRow = { vault_id: string; position: number; user_id: string };

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
const vaultOut = (v: VaultRow, signers: SignerRow[]) => ({
  id: v.id,
  orgId: v.org_id,
  chain: v.chain,
  threshold: v.threshold,
  signerCount: v.signer_count,
  signers: signers.filter((s) => s.vault_id === v.id).map((s) => ({ position: s.position, userId: s.user_id })),
  descriptorCiphertext: toB64(v.descriptor_ciphertext)!,
  encryption: v.encryption,
  createdBy: v.created_by,
  createdAt: iso(v.created_at)!,
});
const proposalOut = (p: ProposalRow, decisions: DecisionRow[]) => ({
  id: p.id,
  vaultId: p.vault_id,
  createdBy: p.created_by,
  status: p.status,
  requiredApprovals: p.required_approvals,
  payloadCiphertext: toB64(p.payload_ciphertext)!,
  encryption: p.encryption,
  createdAt: iso(p.created_at)!,
  decidedAt: iso(p.decided_at),
  decisions: decisions
    .filter((d) => d.proposal_id === p.id)
    .map((d) => ({ userId: d.user_id, decision: d.decision, signatureCiphertext: toB64(d.signature_ciphertext), createdAt: iso(d.created_at)! })),
});

async function loadProposal(db: Db, proposalId: string) {
  const [p] = await db.query<ProposalRow>("SELECT * FROM proposals WHERE id = $1", [proposalId]);
  const ds = await db.query<DecisionRow>("SELECT * FROM approvals WHERE proposal_id = $1 ORDER BY created_at", [proposalId]);
  return proposalOut(p!, ds);
}

async function isSigner(db: Db, vaultId: string, userId: string): Promise<boolean> {
  return (await db.query("SELECT 1 FROM vault_signers WHERE vault_id = $1 AND user_id = $2 LIMIT 1", [vaultId, userId])).length > 0;
}

export function registerVaultRoutes(app: OpenAPIHono<AppEnv>, { db, passkeys }: Deps) {
  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/orgs/{orgId}/vaults",
      tags: ["kluizen"],
      summary: "Multisig-kluis registreren (watch-only; de server krijgt alleen een versleutelde descriptor)",
      description:
        "`signers` bevat per sleutel (in descriptor-volgorde) de gebruiker die hem houdt. Eén persoon mag meerdere sleutels houden. " +
        "Alle ondertekenaars moeten actief lid zijn met rol eigenaar of goedkeurder. Goedkeuringen wegen naar aantal sleutels.",
      request: {
        params: z.object({ orgId: Uuid }),
        ...body(
          z
            .object({
              chain: Chain,
              threshold: z.number().int().min(2).max(15),
              signers: z.array(Uuid).min(2).max(15),
              descriptorCiphertext: Ciphertext,
              encryption: Encryption,
              stepUp: StepUp,
            })
            .refine((v) => v.threshold <= v.signers.length, { message: "threshold mag niet groter zijn dan het aantal sleutels", path: ["threshold"] }),
        ),
      },
      responses: { 201: json(Vault, "Aangemaakt"), ...errorResponses },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      const input = c.req.valid("json");
      const { userId } = c.get("user");
      await requireRole(db, orgId, userId, CAN.manage);
      await requireStepUp(db, passkeys, userId, targets.createVault(orgId), input.stepUp);
      const id = newId();
      const out = await db.transaction(async (tx) => {
        await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`members:${orgId}`]);
        const eligible = new Set(
          (
            await tx.query<{ user_id: string }>(
              "SELECT user_id FROM memberships WHERE org_id = $1 AND status = 'active' AND role IN ('owner', 'approver') AND user_id = ANY($2::uuid[])",
              [orgId, [...new Set(input.signers)]],
            )
          ).map((r) => r.user_id),
        );
        if (input.signers.some((s) => !eligible.has(s))) {
          throw new ApiError(400, "invalid_signer", "Elke ondertekenaar moet actief lid zijn met rol eigenaar of goedkeurder.");
        }
        const [v] = await tx.query<VaultRow>(
          `INSERT INTO vaults (id, org_id, chain, threshold, signer_count, descriptor_ciphertext, encryption, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [id, orgId, input.chain, input.threshold, input.signers.length, fromB64(input.descriptorCiphertext), JSON.stringify(input.encryption), userId],
        );
        for (const [i, s] of input.signers.entries()) {
          await tx.query("INSERT INTO vault_signers (vault_id, position, user_id) VALUES ($1, $2, $3)", [id, i + 1, s]);
        }
        await appendAudit(tx, {
          chain: orgChain(orgId),
          actorId: userId,
          action: "vault.created",
          target: `vault:${id}`,
          details: { chain: input.chain, threshold: input.threshold, signerCount: input.signers.length, signers: input.signers },
        });
        const signers = await tx.query<SignerRow>("SELECT * FROM vault_signers WHERE vault_id = $1 ORDER BY position", [id]);
        return vaultOut(v!, signers);
      });
      return c.json(out, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/orgs/{orgId}/vaults",
      tags: ["kluizen"],
      request: { params: z.object({ orgId: Uuid }) },
      responses: { 200: json(z.array(Vault)), ...errorResponses },
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      await requireRole(db, orgId, c.get("user").userId, CAN.read);
      const rows = await db.query<VaultRow>("SELECT * FROM vaults WHERE org_id = $1 ORDER BY created_at", [orgId]);
      const signers = rows.length
        ? await db.query<SignerRow>("SELECT * FROM vault_signers WHERE vault_id = ANY($1::uuid[]) ORDER BY position", [rows.map((r) => r.id)])
        : [];
      return c.json(rows.map((v) => vaultOut(v, signers)), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/vaults/{vaultId}",
      tags: ["kluizen"],
      request: { params: z.object({ vaultId: Uuid }) },
      responses: { 200: json(Vault), ...errorResponses },
    }),
    async (c) => {
      const { vaultId } = c.req.valid("param");
      await requireRole(db, await orgOfVault(db, vaultId), c.get("user").userId, CAN.read);
      const [v] = await db.query<VaultRow>("SELECT * FROM vaults WHERE id = $1", [vaultId]);
      const signers = await db.query<SignerRow>("SELECT * FROM vault_signers WHERE vault_id = $1 ORDER BY position", [vaultId]);
      return c.json(vaultOut(v!, signers), 200);
    },
  );

  // ---------------------------------------------------------------- voorstellen
  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/vaults/{vaultId}/proposals",
      tags: ["goedkeuringen"],
      summary: "Transactievoorstel indienen (versleutelde PSBT/transactie). Alleen ondertekenaars van deze kluis.",
      request: { params: z.object({ vaultId: Uuid }), ...body(z.object({ payloadCiphertext: Ciphertext, encryption: Encryption })) },
      responses: { 201: json(Proposal, "Aangemaakt"), ...errorResponses },
    }),
    async (c) => {
      const { vaultId } = c.req.valid("param");
      const input = c.req.valid("json");
      const { userId } = c.get("user");
      const orgId = await orgOfVault(db, vaultId);
      await requireRole(db, orgId, userId, CAN.approve);
      const row = await db.transaction(async (tx) => {
        await requireRole(tx, orgId, userId, CAN.approve);
        if (!(await isSigner(tx, vaultId, userId))) throw forbidden();
        const [v] = await tx.query<{ threshold: number }>("SELECT threshold FROM vaults WHERE id = $1", [vaultId]);
        const [p] = await tx.query<ProposalRow>(
          `INSERT INTO proposals (id, vault_id, created_by, status, required_approvals, payload_ciphertext, encryption)
           VALUES ($1, $2, $3, 'pending', $4, $5, $6) RETURNING *`,
          [newId(), vaultId, userId, v!.threshold, fromB64(input.payloadCiphertext), JSON.stringify(input.encryption)],
        );
        await appendAudit(tx, { chain: orgChain(orgId), actorId: userId, action: "proposal.created", target: `proposal:${p!.id}`, details: { vaultId } });
        return p!;
      });
      return c.json(proposalOut(row, []), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/vaults/{vaultId}/proposals",
      tags: ["goedkeuringen"],
      request: { params: z.object({ vaultId: Uuid }) },
      responses: { 200: json(z.array(Proposal)), ...errorResponses },
    }),
    async (c) => {
      const { vaultId } = c.req.valid("param");
      await requireRole(db, await orgOfVault(db, vaultId), c.get("user").userId, CAN.read);
      const ps = await db.query<ProposalRow>("SELECT * FROM proposals WHERE vault_id = $1 ORDER BY created_at DESC LIMIT 200", [vaultId]);
      const ds = ps.length
        ? await db.query<DecisionRow>("SELECT * FROM approvals WHERE proposal_id = ANY($1::uuid[]) ORDER BY created_at", [ps.map((p) => p.id)])
        : [];
      return c.json(ps.map((p) => proposalOut(p, ds)), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/proposals/{proposalId}",
      tags: ["goedkeuringen"],
      request: { params: z.object({ proposalId: Uuid }) },
      responses: { 200: json(Proposal), ...errorResponses },
    }),
    async (c) => {
      const { proposalId } = c.req.valid("param");
      const { orgId } = await orgOfProposal(db, proposalId);
      await requireRole(db, orgId, c.get("user").userId, CAN.read);
      return c.json(await loadProposal(db, proposalId), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/proposals/{proposalId}/decisions",
      tags: ["goedkeuringen"],
      summary: "Goedkeuren of afwijzen, met verse passkey-bevestiging. Bij goedkeuring kan een versleutelde (gedeeltelijke) handtekening mee.",
      request: {
        params: z.object({ proposalId: Uuid }),
        ...body(z.object({ decision: z.enum(["approve", "reject"]), signatureCiphertext: Ciphertext.optional(), stepUp: StepUp })),
      },
      responses: { 200: json(Proposal), ...errorResponses },
    }),
    async (c) => {
      const { proposalId } = c.req.valid("param");
      const { decision, signatureCiphertext, stepUp } = c.req.valid("json");
      const { userId } = c.get("user");
      const { orgId, vaultId } = await orgOfProposal(db, proposalId);
      await requireRole(db, orgId, userId, CAN.approve);
      if (!(await isSigner(db, vaultId, userId))) throw forbidden();
      await requireStepUp(db, passkeys, userId, targets.decision(proposalId, decision), stepUp);
      await db.transaction(async (tx) => {
        // Rij-lock: gelijktijdige beslissingen worden na elkaar verwerkt, zodat de telling klopt.
        const [p] = await tx.query<ProposalRow>("SELECT * FROM proposals WHERE id = $1 FOR UPDATE", [proposalId]);
        if (p!.status !== "pending") throw conflict(`Voorstel is al ${p!.status}.`);
        await requireRole(tx, orgId, userId, CAN.approve); // rol kan net gewijzigd zijn
        const dup = await tx.query("SELECT 1 FROM approvals WHERE proposal_id = $1 AND user_id = $2", [proposalId, userId]);
        if (dup.length) throw conflict("Je hebt dit voorstel al beoordeeld.");
        await tx.query("INSERT INTO approvals (proposal_id, user_id, decision, signature_ciphertext) VALUES ($1, $2, $3, $4)", [
          proposalId,
          userId,
          decision,
          signatureCiphertext && decision === "approve" ? fromB64(signatureCiphertext) : null,
        ]);
        await appendAudit(tx, { chain: orgChain(orgId), actorId: userId, action: `proposal.${decision}`, target: `proposal:${proposalId}` });
        await recomputeProposal(tx, proposalId, orgId);
      });
      return c.json(await loadProposal(db, proposalId), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/proposals/{proposalId}/cancel",
      tags: ["goedkeuringen"],
      request: { params: z.object({ proposalId: Uuid }), ...body(z.object({ stepUp: StepUp })) },
      responses: { 200: json(Proposal), ...errorResponses },
    }),
    async (c) => {
      const { proposalId } = c.req.valid("param");
      const { stepUp } = c.req.valid("json");
      const { userId } = c.get("user");
      const { orgId } = await orgOfProposal(db, proposalId);
      await requireRole(db, orgId, userId, CAN.read);
      await requireStepUp(db, passkeys, userId, targets.cancel(proposalId), stepUp);
      await db.transaction(async (tx) => {
        const role = await requireRole(tx, orgId, userId, CAN.read);
        const [p] = await tx.query<ProposalRow>("SELECT * FROM proposals WHERE id = $1 FOR UPDATE", [proposalId]);
        if (p!.created_by !== userId && role !== "owner") throw forbidden();
        if (p!.status !== "pending") throw conflict(`Voorstel is al ${p!.status}.`);
        await tx.query("UPDATE proposals SET status = 'cancelled', decided_at = now() WHERE id = $1", [proposalId]);
        await appendAudit(tx, { chain: orgChain(orgId), actorId: userId, action: "proposal.cancelled", target: `proposal:${proposalId}` });
      });
      return c.json(await loadProposal(db, proposalId), 200);
    },
  );
}
