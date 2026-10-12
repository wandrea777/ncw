import type { Db } from "../db/db.ts";
import { forbidden, notFound } from "./errors.ts";

export type Role = "owner" | "approver" | "viewer";

export const CAN = {
  read: ["owner", "approver", "viewer"] as Role[],
  approve: ["owner", "approver"] as Role[],
  manage: ["owner"] as Role[],
};

/**
 * Centrale autorisatie. Geen lid → 404 (verbergt dat de organisatie bestaat).
 * Lid zonder de juiste rol → 403.
 */
export async function requireRole(db: Db, orgId: string, userId: string, allowed: Role[]): Promise<Role> {
  // Alleen actieve leden; 'pending' (nog niet bevestigd door een eigenaar) telt als geen lid.
  const row = (
    await db.query<{ role: Role }>("SELECT role FROM memberships WHERE org_id = $1 AND user_id = $2 AND status = 'active'", [orgId, userId])
  )[0];
  if (!row) throw notFound();
  if (!allowed.includes(row.role)) throw forbidden();
  return row.role;
}

export async function orgOfVault(db: Db, vaultId: string): Promise<string> {
  const row = (await db.query<{ org_id: string }>("SELECT org_id FROM vaults WHERE id = $1", [vaultId]))[0];
  if (!row) throw notFound();
  return row.org_id;
}

export async function orgOfProposal(db: Db, proposalId: string): Promise<{ orgId: string; vaultId: string }> {
  const row = (
    await db.query<{ org_id: string; vault_id: string }>(
      "SELECT v.org_id, p.vault_id FROM proposals p JOIN vaults v ON v.id = p.vault_id WHERE p.id = $1",
      [proposalId],
    )
  )[0];
  if (!row) throw notFound();
  return { orgId: row.org_id, vaultId: row.vault_id };
}
