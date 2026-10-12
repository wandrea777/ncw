import type { Db } from "../db/db.ts";
import { canonicalJson, sha256Hex } from "./crypto.ts";

const GENESIS = "0".repeat(64);

export interface AuditEntry {
  chain: string;
  seq: number;
  actor_id: string | null;
  action: string;
  target: string | null;
  details: Record<string, unknown>;
  created_at: string;
  prev_hash: string;
  hash: string;
}

export const orgChain = (orgId: string) => `org:${orgId}`;
export const SYSTEM_CHAIN = "system";

function entryHash(e: Omit<AuditEntry, "hash">): string {
  return sha256Hex(
    canonicalJson({
      chain: e.chain,
      seq: Number(e.seq),
      actor_id: e.actor_id,
      action: e.action,
      target: e.target,
      details: e.details,
      created_at: e.created_at,
      prev_hash: e.prev_hash,
    }),
  );
}

/**
 * Voegt een regel toe aan de hash-keten. Moet binnen dezelfde transactie draaien als de actie zelf,
 * zodat er geen actie zonder auditregel kan bestaan. Een advisory lock per keten voorkomt races.
 * Details mogen NOOIT geheimen of ciphertext bevatten.
 */
export async function appendAudit(
  tx: Db,
  e: { chain: string; actorId: string | null; action: string; target?: string | null; details?: Record<string, unknown> },
): Promise<void> {
  await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [e.chain]);
  const last = (
    await tx.query<{ seq: string | number; hash: string }>(
      // Let op: sorteer op de numerieke kolom, niet op een tekst-alias ("9" > "10").
      "SELECT audit_log.seq, audit_log.hash FROM audit_log WHERE chain = $1 ORDER BY audit_log.seq DESC LIMIT 1",
      [e.chain],
    )
  )[0];
  const base = {
    chain: e.chain,
    seq: last ? Number(last.seq) + 1 : 1,
    actor_id: e.actorId,
    action: e.action,
    target: e.target ?? null,
    details: e.details ?? {},
    created_at: new Date().toISOString(),
    prev_hash: last?.hash ?? GENESIS,
  };
  await tx.query(
    `INSERT INTO audit_log (chain, seq, actor_id, action, target, details, created_at, prev_hash, hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [base.chain, base.seq, base.actor_id, base.action, base.target, JSON.stringify(base.details), base.created_at, base.prev_hash, entryHash(base)],
  );
}

export async function readChain(db: Db, chain: string): Promise<AuditEntry[]> {
  const rows = await db.query<AuditEntry & { created_at: string | Date }>(
    `SELECT chain, seq::int AS seq, actor_id, action, target, details,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at, prev_hash, hash
     FROM audit_log WHERE chain = $1 ORDER BY audit_log.seq`,
    [chain],
  );
  return rows.map((r) => ({ ...r, seq: Number(r.seq), created_at: String(r.created_at) }));
}

/** Herberekent de keten. Elke wijziging, verwijdering of invoeging wordt zo zichtbaar. */
export function verifyChain(entries: AuditEntry[]): { ok: boolean; brokenAt: number | null; count: number } {
  let prev = GENESIS;
  for (const [i, e] of entries.entries()) {
    const { hash, ...rest } = e;
    if (e.seq !== i + 1 || e.prev_hash !== prev || entryHash(rest) !== hash) {
      return { ok: false, brokenAt: e.seq, count: entries.length };
    }
    prev = hash;
  }
  return { ok: true, brokenAt: null, count: entries.length };
}
