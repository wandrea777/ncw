import pg from "pg";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Minimale database-interface: alleen geparametriseerde queries (geen string-concatenatie → geen SQL-injectie)
 * en transacties. Werkt met echte PostgreSQL (productie) en PGlite (ontwikkeling en tests).
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Voert een volledig SQL-script uit (meerdere statements, geen parameters). Alleen voor migraties. */
  exec(sql: string): Promise<void>;
  transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R>;
  close(): Promise<void>;
}

export function createPgDb(connectionString: string): Db {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    ssl: connectionString.includes("sslmode=disable") ? false : { rejectUnauthorized: true },
  });
  const wrap = (client: pg.Pool | pg.PoolClient): Db["query"] => async (sql, params = []) =>
    (await client.query(sql, params)).rows;
  const execOn = (client: pg.Pool | pg.PoolClient) => async (sql: string) => {
    await client.query(sql);
  };
  return {
    query: wrap(pool),
    exec: execOn(pool),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN"); // READ COMMITTED + expliciete rij- en advisory locks
        const txDb: Db = { query: wrap(client), exec: execOn(client), transaction: (f) => f(txDb), close: async () => {} };
        const result = await fn(txDb);
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  if (dataDir) mkdirSync(dirname(dataDir), { recursive: true });
  const db = new PGlite(dataDir);
  await db.waitReady;
  const query: Db["query"] = async (sql, params = []) => (await db.query(sql, params)).rows as never;
  return {
    query,
    exec: async (sql) => {
      await db.exec(sql);
    },
    async transaction(fn) {
      return db.transaction(async (tx) => {
        const txQuery: Db["query"] = async (sql, params = []) => (await tx.query(sql, params)).rows as never;
        const txDb: Db = {
          query: txQuery,
          exec: async (sql) => {
            await tx.exec(sql);
          },
          transaction: (f) => f(txDb),
          close: async () => {},
        };
        return fn(txDb);
      });
    },
    close: () => db.close(),
  };
}
