import type { Db } from "../db/db.ts";
import { appendAudit, orgChain } from "./audit.ts";

export type ProposalStatus = "pending" | "approved" | "rejected" | "cancelled";

/**
 * Bepaalt de status van een openstaand voorstel opnieuw.
 *
 * Gewicht = aantal sleutels dat een ondertekenaar in deze kluis houdt. Alleen stemmen van ondertekenaars
 * die NU actief lid zijn met rol eigenaar/goedkeurder tellen mee (een verwijderd of gedegradeerd lid
 * telt niet meer, in beide richtingen).
 *   approved  ⇔ gewicht van goedkeurders ≥ drempel
 *   rejected  ⇔ gewicht van iedereen die (nog) niet heeft afgewezen < drempel   (drempel onhaalbaar)
 * Een goedkeuring kan dus nooit tot afwijzing leiden.
 * Moet binnen een transactie draaien; het voorstel wordt gelockt.
 */
export async function recomputeProposal(tx: Db, proposalId: string, orgId: string): Promise<ProposalStatus> {
  const [p] = await tx.query<{ status: ProposalStatus; vault_id: string; required_approvals: number }>(
    "SELECT status, vault_id, required_approvals FROM proposals WHERE id = $1 FOR UPDATE",
    [proposalId],
  );
  if (!p || p.status !== "pending") return p?.status ?? "cancelled";
  const rows = await tx.query<{ user_id: string; weight: number; decision: "approve" | "reject" | null }>(
    `SELECT vs.user_id, count(*)::int AS weight, a.decision
     FROM vault_signers vs
     JOIN memberships m ON m.user_id = vs.user_id AND m.org_id = $2 AND m.status = 'active' AND m.role IN ('owner', 'approver')
     LEFT JOIN approvals a ON a.proposal_id = $3 AND a.user_id = vs.user_id
     WHERE vs.vault_id = $1
     GROUP BY vs.user_id, a.decision`,
    [p.vault_id, orgId, proposalId],
  );
  const approved = rows.filter((r) => r.decision === "approve").reduce((s, r) => s + r.weight, 0);
  const possible = rows.filter((r) => r.decision !== "reject").reduce((s, r) => s + r.weight, 0);
  let status: ProposalStatus = "pending";
  if (approved >= p.required_approvals) status = "approved";
  else if (possible < p.required_approvals) status = "rejected";
  if (status !== "pending") {
    await tx.query("UPDATE proposals SET status = $2, decided_at = now() WHERE id = $1", [proposalId, status]);
    await appendAudit(tx, { chain: orgChain(orgId), actorId: null, action: `proposal.${status}`, target: `proposal:${proposalId}`, details: { approvedWeight: approved, threshold: p.required_approvals } });
  }
  return status;
}

/** Na een wijziging in lidmaatschap of rol: alle openstaande voorstellen van de organisatie herberekenen. */
export async function recomputeOrgPending(tx: Db, orgId: string): Promise<void> {
  const ids = await tx.query<{ id: string }>(
    "SELECT p.id FROM proposals p JOIN vaults v ON v.id = p.vault_id WHERE v.org_id = $1 AND p.status = 'pending' ORDER BY p.id",
    [orgId],
  );
  for (const { id } of ids) await recomputeProposal(tx, id, orgId);
}
