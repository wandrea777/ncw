import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { Db } from "./db.ts";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const MIGRATION_LOCK = 7_262_001; // vaste sleutel voor de advisory lock

/**
 * Past SQL-migraties in volgorde toe. Per migratie één transactie met een advisory lock, zodat
 * twee instanties die tegelijk starten niet tegelijk migreren. De checksum wordt bewaard: een
 * achteraf gewijzigde migratie wordt gedetecteerd en de start wordt geweigerd.
 */
export async function migrate(db: Db): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done: string[] = [];
  for (const name of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, name), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    await db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK]);
      const prev = (await tx.query<{ checksum: string }>("SELECT checksum FROM schema_migrations WHERE name = $1", [name]))[0];
      if (prev) {
        if (prev.checksum !== checksum) throw new Error(`Migratie ${name} is gewijzigd na toepassing. Maak een nieuwe migratie.`);
        return;
      }
      await tx.exec(sql);
      await tx.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [name, checksum]);
      done.push(name);
    });
  }
  return done;
}

/**
 * Alleen-lezen controle (voor productie, waar de app-rol geen schemarechten heeft):
 * geeft de migraties terug die ontbreken of een andere checksum hebben.
 */
export async function pendingMigrations(db: Db): Promise<string[]> {
  const rows = await db.query<{ name: string; checksum: string }>("SELECT name, checksum FROM schema_migrations").catch(() => null);
  const applied = new Map((rows ?? []).map((r) => [r.name, r.checksum]));
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((name) => applied.get(name) !== createHash("sha256").update(readFileSync(join(MIGRATIONS_DIR, name), "utf8")).digest("hex"));
}
