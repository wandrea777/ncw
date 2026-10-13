import { afterAll } from "vitest";
import { createApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { createPgDb, createPgliteDb, type Db } from "../src/db/db.ts";
import { migrate } from "../src/db/migrate.ts";
import type { PasskeyService } from "../src/auth/webauthn.ts";

export const ORIGIN = "http://localhost:5188";

/**
 * Nep-authenticator: een "response" is { id, counter }. Registratie levert een publieke sleutel
 * op die we bij authenticatie vergelijken. Zo testen we de serverlogica zonder browser.
 */
export const fakePasskeys: PasskeyService = {
  async registrationOptions() {
    return { challenge: `reg-${crypto.randomUUID()}`, options: { fake: true } };
  },
  async verifyRegistration({ response }) {
    const r = response as { id: string; fail?: boolean };
    if (r.fail) throw new Error("fail");
    return { credentialId: r.id, publicKey: new TextEncoder().encode(`pk-${r.id}`), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true };
  },
  async authenticationOptions() {
    return { challenge: `auth-${crypto.randomUUID()}`, options: { fake: true } };
  },
  async verifyAuthentication({ response, passkey }) {
    const r = response as { id: string; counter?: number; fail?: boolean };
    if (r.fail || new TextDecoder().decode(passkey.publicKey) !== `pk-${r.id}`) throw new Error("fail");
    return { newCounter: r.counter ?? 0 };
  },
};

/**
 * Testdatabase. Standaard PGlite in geheugen. Met TEST_DATABASE_URL (CI) een echte PostgreSQL,
 * met per test een eigen schema, zodat concurrency en locks echt worden getest.
 */
async function testDb(): Promise<Db> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return createPgliteDb();
  const schema = `t_${crypto.randomUUID().replace(/-/g, "")}`;
  schemas.push(schema);
  const admin = createPgDb(url);
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
  } finally {
    await admin.close();
  }
  const sep = url.includes("?") ? "&" : "?";
  return createPgDb(`${url}${sep}options=${encodeURIComponent(`-c search_path=${schema}`)}`);
}

// Alle databases van dit testbestand netjes sluiten (anders blijven pg-verbindingen open in CI)
// en de tijdelijke testschema's verwijderen (alleen bij echte PostgreSQL).
const opened: Db[] = [];
const schemas: string[] = [];
afterAll(async () => {
  await Promise.all(opened.map((d) => d.close().catch(() => {})));
  const url = process.env.TEST_DATABASE_URL;
  if (url && schemas.length) {
    const admin = createPgDb(url);
    try {
      // Schemanamen zijn altijd "t_" + hex (zie testDb), dus veilig om te interpoleren.
      for (const s of schemas) await admin.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`).catch(() => {});
    } finally {
      await admin.close();
    }
  }
});

export async function setup() {
  const db = await testDb();
  opened.push(db);
  await migrate(db);
  const cfg = loadConfig({ NODE_ENV: "test", APP_ORIGIN: ORIGIN });
  let ipCounter = 0;
  const app = createApp({
    db,
    cfg,
    passkeys: fakePasskeys,
    log: (e) => {
      if (e.level === "error") console.error("APPLOG", JSON.stringify(e));
    },
    clientIp: () => `ip-${ipCounter}`,
  });
  return { db, app, freshIp: () => void ipCounter++ };
}

export type TestApp = Awaited<ReturnType<typeof setup>>["app"];

/** Mini-client die de sessiecookie bijhoudt en de juiste Origin meestuurt. */
export function client(app: TestApp) {
  let cookie = "";
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.request(path, {
      method,
      headers: { origin: ORIGIN, "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!.endsWith("=") ? "" : set.split(";")[0]!;
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  };
  return {
    get: (p: string) => call("GET", p),
    post: (p: string, b?: unknown, h?: Record<string, string>) => call("POST", p, b ?? {}, h),
    put: (p: string, b: unknown) => call("PUT", p, b),
    patch: (p: string, b: unknown) => call("PATCH", p, b),
    del: (p: string, b?: unknown) => call("DELETE", p, b ?? {}),
    raw: call,
    get cookie() {
      return cookie;
    },
    set cookie(v: string) {
      cookie = v;
    },
  };
}

export type Client = ReturnType<typeof client>;

export async function registerUser(app: TestApp, name: string, credentialId = `cred-${name}-${crypto.randomUUID()}`) {
  const c = client(app);
  const opt = await c.post("/v1/auth/register/options", { displayName: name });
  const ver = await c.post("/v1/auth/register/verify", { challengeId: opt.body.challengeId, response: { id: credentialId } });
  if (ver.status !== 200) throw new Error(`registratie mislukt: ${JSON.stringify(ver.body)}`);
  /** Verse passkey-bevestiging voor één actie. */
  const su = async (target: string, response: Record<string, unknown> = {}) => {
    const o = await c.post("/v1/auth/step-up/options", { target });
    if (o.status !== 200) throw new Error(`step-up options mislukt: ${JSON.stringify(o.body)}`);
    return { challengeId: o.body.challengeId as string, response: { id: credentialId, ...response } };
  };
  return { c, user: ver.body.user as { id: string; displayName: string }, credentialId, su };
}

export type TestUser = Awaited<ReturnType<typeof registerUser>>;

export const CT = Buffer.from("versleutelde-data-met-tag!").toString("base64");
export const ENC = { alg: "xchacha20poly1305", keyId: "org-key-1", nonce: Buffer.from("nonce-24-bytes-xxxxxxxxx").toString("base64") };

export const T = {
  invite: (org: string) => `org:${org}:invite`,
  confirm: (org: string, u: string) => `org:${org}:member:${u}:confirm`,
  role: (org: string, u: string) => `org:${org}:member:${u}:role`,
  remove: (org: string, u: string) => `org:${org}:member:${u}:remove`,
  vault: (org: string) => `org:${org}:vault:create`,
  decision: (p: string, d: "approve" | "reject") => `proposal:${p}:${d}`,
  wrap: (org: string) => `org:${org}:keys:wrap`,
  passkey: (id: string) => `passkey:${id}:delete`,
  cancel: (p: string) => `proposal:${p}:cancel`,
  revokeInvite: (org: string, inv: string) => `org:${org}:invitation:${inv}:revoke`,
  encKey: (u: string) => `user:${u}:encryption-key`,
};

export async function orgWithMembers() {
  const env = await setup();
  const owner = await registerUser(env.app, "Eigenaar");
  const org = (await owner.c.post("/v1/orgs", { name: "Voorbeeld Holding B.V." })).body;
  /** Volledige flow: uitnodigen → accepteren (pending) → bevestigen door eigenaar. */
  const invite = async (role: "approver" | "viewer", name: string, { confirm = true } = {}) => {
    env.freshIp();
    const inv = await owner.c.post(`/v1/orgs/${org.id}/invitations`, { role, stepUp: await owner.su(T.invite(org.id)) });
    if (inv.status !== 201) throw new Error(JSON.stringify(inv.body));
    const m = await registerUser(env.app, name);
    const acc = await m.c.post("/v1/invitations/accept", { code: inv.body.code });
    if (acc.status !== 200) throw new Error(JSON.stringify(acc.body));
    if (confirm) {
      const conf = await owner.c.post(`/v1/orgs/${org.id}/members/${m.user.id}/confirm`, { stepUp: await owner.su(T.confirm(org.id, m.user.id)) });
      if (conf.status !== 200) throw new Error(JSON.stringify(conf.body));
    }
    return { ...m, code: inv.body.code as string, safetyCode: acc.body.safetyCode as string };
  };
  const createVault = async (signers: string[], threshold: number, by: TestUser = owner) =>
    by.c.post(`/v1/orgs/${org.id}/vaults`, {
      chain: "bitcoin",
      threshold,
      signers,
      descriptorCiphertext: CT,
      encryption: ENC,
      stepUp: await by.su(T.vault(org.id)),
    });
  const decide = async (u: TestUser, proposalId: string, decision: "approve" | "reject", extra: Record<string, unknown> = {}) =>
    u.c.post(`/v1/proposals/${proposalId}/decisions`, { decision, stepUp: await u.su(T.decision(proposalId, decision)), ...extra });
  const propose = async (u: TestUser, vaultId: string) => u.c.post(`/v1/vaults/${vaultId}/proposals`, { payloadCiphertext: CT, encryption: ENC });
  const cancel = async (u: TestUser, proposalId: string) => u.c.post(`/v1/proposals/${proposalId}/cancel`, { stepUp: await u.su(T.cancel(proposalId)) });
  return { ...env, owner, org, invite, createVault, decide, propose, cancel };
}

export type { Db };
