import { loadConfig } from "../config.ts";
import { createPgDb, createPgliteDb } from "./db.ts";
import { migrate } from "./migrate.ts";

const cfg = loadConfig();
const db = cfg.databaseUrl ? createPgDb(cfg.databaseUrl) : await createPgliteDb(".data/pglite");
console.log("Toegepast:", await migrate(db));
await db.close();
