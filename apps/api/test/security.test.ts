import { describe, expect, it } from "vitest";
import { readChain, verifyChain } from "../src/lib/audit.ts";
import { loadConfig } from "../src/config.ts";
import { CT, ENC, T, client, orgWithMembers, registerUser, setup } from "./helpers.ts";
import { migrate, pendingMigrations } from "../src/db/migrate.ts";

describe("beveiliging", () => {
  it("zet beveiligingsheaders en no-store", async () => {
    const { app } = await setup();
    const res = await app.request("/health");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=63072000");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("validatiefouten echoën de invoer niet terug", async () => {
    const { app } = await setup();
    const c = client(app);
    const secret = "<script>alert(1)</script>".repeat(10);
    const res = await c.post("/v1/auth/register/options", { displayName: secret });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain("<script>");
  });

  it("weigert te grote verzoeken", async () => {
    const { app } = await setup();
    const c = client(app);
    const res = await c.post("/v1/auth/register/options", { displayName: "x".repeat(300_000) });
    expect(res.status).toBe(413);
  });

  it("weigert ongeldige, niet-canonieke of te korte ciphertext en vrije tekst in keyId", async () => {
    const { owner, org } = await orgWithMembers();
    const base = { chain: "bitcoin", threshold: 2, signers: [owner.user.id, owner.user.id], encryption: ENC };
    for (const bad of ["niet base64!!", "A", "QUJD", Buffer.alloc(8).toString("base64")]) {
      const r = await owner.c.post(`/v1/orgs/${org.id}/vaults`, { ...base, descriptorCiphertext: bad, stepUp: await owner.su(T.vault(org.id)) });
      expect(r.status, bad).toBe(400);
    }
    const r = await owner.c.post(`/v1/orgs/${org.id}/vaults`, {
      ...base,
      descriptorCiphertext: CT,
      encryption: { ...ENC, keyId: "mijn geheime sleutel van Jan" },
      stepUp: await owner.su(T.vault(org.id)),
    });
    expect(r.status).toBe(400);
  });

  it("zonder sessie geen toegang tot beschermde routes", async () => {
    const { app } = await setup();
    const c = client(app);
    for (const p of ["/v1/orgs", "/v1/me", `/v1/vaults/${crypto.randomUUID()}/proposals`]) expect((await c.get(p)).status).toBe(401);
  });

  it("auditlog is append-only in de database (ook TRUNCATE)", async () => {
    const { app, db } = await setup();
    await registerUser(app, "Anna");
    await expect(db.query("UPDATE audit_log SET action = 'x'")).rejects.toThrow(/append-only/);
    await expect(db.query("DELETE FROM audit_log")).rejects.toThrow(/append-only/);
    await expect(db.query("TRUNCATE audit_log")).rejects.toThrow(/append-only/);
  });

  it("hash-keten detecteert manipulatie", async () => {
    const { app, db } = await setup();
    const a = await registerUser(app, "Anna");
    const org = (await a.c.post("/v1/orgs", { name: "X" })).body;
    await a.c.post(`/v1/orgs/${org.id}/invitations`, { role: "viewer", stepUp: await a.su(T.invite(org.id)) });
    const chain = await readChain(db, `org:${org.id}`);
    expect(verifyChain(chain).ok).toBe(true);
    const tampered = chain.map((e, i) => (i === 1 ? { ...e, details: { role: "owner" } } : e));
    expect(verifyChain(tampered)).toEqual({ ok: false, brokenAt: 2, count: 2 });
    expect(verifyChain(chain.slice(1)).ok).toBe(false);
    // Laatste regel weglaten is intern niet te zien, maar wel tegen een buiten de app bewaarde head-hash.
    const pinnedHead = chain.at(-1)!.hash;
    expect(verifyChain(chain.slice(0, -1)).ok).toBe(true);
    expect(chain.slice(0, -1).at(-1)!.hash).not.toBe(pinnedHead);
  });

  it("weigert een onveilige of onbekende configuratie (fail closed)", () => {
    expect(() => loadConfig({ NODE_ENV: "prod" })).toThrow(/NODE_ENV/);
    expect(() => loadConfig({ NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
    expect(() => loadConfig({ NODE_ENV: "test", SESSION_TTL_HOURS: "abc" })).toThrow(/SESSION_TTL_HOURS/);
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/DATABASE_URL/);
    expect(() =>
      loadConfig({ NODE_ENV: "production", DATABASE_URL: "postgres://x/y?sslmode=disable", APP_ORIGIN: "https://app.nl", RP_ID: "app.nl" }),
    ).toThrow(/TLS/);
  });

  it("publiceert een OpenAPI-specificatie", async () => {
    const { app } = await setup();
    const spec = (await (await app.request("/v1/openapi.json")).json()) as { openapi: string; paths: Record<string, unknown> };
    expect(spec.openapi).toBe("3.1.0");
    expect(Object.keys(spec.paths)).toContain("/v1/proposals/{proposalId}/decisions");
  });
});

describe("auditketen met veel regels", () => {
  it("blijft correct na meer dan tien regels (regressie: tekstsortering van seq)", async () => {
    const { app, db } = await setup();
    const a = await registerUser(app, "Anna");
    const org = (await a.c.post("/v1/orgs", { name: "X" })).body;
    for (let i = 0; i < 12; i++) {
      expect((await a.c.post(`/v1/orgs/${org.id}/invitations`, { role: "viewer", stepUp: await a.su(T.invite(org.id)) })).status).toBe(201);
    }
    const chain = await readChain(db, `org:${org.id}`);
    expect(chain.map((e) => e.seq)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    expect(verifyChain(chain).ok).toBe(true);
  });
});

describe("migraties", () => {
  it("weigert te starten als een toegepaste migratie is gewijzigd", async () => {
    const { db } = await setup();
    await db.query("UPDATE schema_migrations SET checksum = 'gewijzigd' WHERE name = '0001_init.sql'");
    await expect(migrate(db)).rejects.toThrow(/gewijzigd/);
  });

  it("alleen-lezen controle voor productie ziet ontbrekende of afwijkende migraties", async () => {
    const { db } = await setup();
    expect(await pendingMigrations(db)).toEqual([]);
    await db.query("UPDATE schema_migrations SET checksum = 'x' WHERE name = '0002_signers_stepup_e2ee.sql'");
    expect(await pendingMigrations(db)).toEqual(["0002_signers_stepup_e2ee.sql"]);
  });
});
