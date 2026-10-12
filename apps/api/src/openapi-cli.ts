// Schrijft de OpenAPI-specificatie naar docs/api/openapi.json (onderdeel van de documentatie).
import { writeFileSync, mkdirSync } from "node:fs";
import { loadConfig } from "./config.ts";
import { createApp } from "./app.ts";
import { createPgliteDb } from "./db/db.ts";
import { createPasskeyService } from "./auth/webauthn.ts";

const cfg = loadConfig({ NODE_ENV: "development" });
const db = await createPgliteDb();
const app = createApp({ db, cfg, passkeys: createPasskeyService(cfg), log: () => {} });
const spec = (await (await app.request("/v1/openapi.json")).json()) as { paths: Record<string, unknown> };
mkdirSync(new URL("../../../docs/api/", import.meta.url), { recursive: true });
writeFileSync(new URL("../../../docs/api/openapi.json", import.meta.url), JSON.stringify(spec, null, 2) + "\n");
console.log(`docs/api/openapi.json: ${Object.keys(spec.paths).length} paden`);
await db.close();
