import { describe, expect, it } from "vitest";
import { T, client, registerUser, setup } from "./helpers.ts";

describe("passkey-authenticatie", () => {
  it("registreert, geeft een sessie, en logout trekt de sessie server-side in", async () => {
    const { app } = await setup();
    const { c, user } = await registerUser(app, "Anna");
    expect(c.cookie).toMatch(/^ncw_session=/);
    const stolen = c.cookie;
    const me = await c.get("/v1/me");
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user.id);
    const out = await c.post("/v1/auth/logout");
    expect(out.status).toBe(204);
    expect(out.headers.get("clear-site-data")).toBe('"cookies"');
    // Een bewaarde (gestolen) cookie werkt na uitloggen niet meer.
    c.cookie = stolen;
    expect((await c.get("/v1/me")).status).toBe(401);
  });

  it("bewaart alleen de hash van het sessietoken", async () => {
    const { app, db } = await setup();
    const { c } = await registerUser(app, "Anna");
    const token = c.cookie.split("=")[1]!;
    const rows = await db.query<{ token_hash: Uint8Array }>("SELECT token_hash FROM sessions");
    expect(rows).toHaveLength(1);
    expect(Buffer.from(rows[0]!.token_hash).toString()).not.toContain(token);
  });

  it("sessie verloopt na inactiviteit en na de absolute termijn", async () => {
    const { app, db } = await setup();
    const { c } = await registerUser(app, "Anna");
    await db.query("UPDATE sessions SET idle_expires_at = now() - interval '1 second'");
    expect((await c.get("/v1/me")).status).toBe(401);
    const b = await registerUser(app, "Bram");
    await db.query("UPDATE sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1", [b.user.id]);
    expect((await b.c.get("/v1/me")).status).toBe(401);
  });

  it("een sessiecontrole met x-kern-session-check verlengt de inactiviteitstermijn niet; gewone verzoeken wel", async () => {
    const { app, db } = await setup();
    const { c } = await registerUser(app, "Anna");
    await db.query("UPDATE sessions SET idle_expires_at = now() + interval '5 minutes'");
    const idle = async () => (await db.query<{ t: Date }>("SELECT idle_expires_at AS t FROM sessions"))[0]!.t.getTime();
    const before = await idle();
    const check = await app.request("/v1/me", { headers: { cookie: c.cookie, "x-kern-session-check": "1" } });
    expect(check.status).toBe(200);
    expect(await idle()).toBe(before);
    // Alleen voor GET: een wijzigend verzoek met de header verlengt gewoon (en valt onder de CSRF-regels).
    expect((await c.get("/v1/me")).status).toBe(200);
    expect(await idle()).toBeGreaterThan(before);
  });

  it("een sessiecontrole op een verlopen sessie geeft 401", async () => {
    const { app, db } = await setup();
    const { c } = await registerUser(app, "Anna");
    await db.query("UPDATE sessions SET idle_expires_at = now() - interval '1 second'");
    const res = await app.request("/v1/me", { headers: { cookie: c.cookie, "x-kern-session-check": "1" } });
    expect(res.status).toBe(401);
  });

  it("logt in met een bestaande passkey en weigert een onbekende", async () => {
    const { app } = await setup();
    const { credentialId } = await registerUser(app, "Bram");
    const c = client(app);
    const opt = await c.post("/v1/auth/login/options");
    const ok = await c.post("/v1/auth/login/verify", { challengeId: opt.body.challengeId, response: { id: credentialId, counter: 1 } });
    expect(ok.status).toBe(200);
    expect(ok.body.user.displayName).toBe("Bram");
    const c2 = client(app);
    const opt2 = await c2.post("/v1/auth/login/options");
    expect((await c2.post("/v1/auth/login/verify", { challengeId: opt2.body.challengeId, response: { id: "onbekend" } })).status).toBe(401);
  });

  it("een challenge is eenmalig (replay wordt geweigerd)", async () => {
    const { app } = await setup();
    const c = client(app);
    const opt = await c.post("/v1/auth/register/options", { displayName: "Cas" });
    expect((await c.post("/v1/auth/register/verify", { challengeId: opt.body.challengeId, response: { id: "x1" } })).status).toBe(200);
    const replay = await c.post("/v1/auth/register/verify", { challengeId: opt.body.challengeId, response: { id: "x2" } });
    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe("challenge_invalid");
  });

  it("dubbele credential-ID geeft 409, geen 500", async () => {
    const { app } = await setup();
    await registerUser(app, "Anna", "zelfde-id");
    const c = client(app);
    const opt = await c.post("/v1/auth/register/options", { displayName: "Kaper" });
    const r = await c.post("/v1/auth/register/verify", { challengeId: opt.body.challengeId, response: { id: "zelfde-id" } });
    expect(r.status).toBe(409);
  });

  it("vervalste verzoeken kunnen geen valse kloonalarmen in het auditlog schrijven", async () => {
    const { app, db } = await setup();
    const { credentialId } = await registerUser(app, "Dirk");
    const c = client(app);
    const o1 = await c.post("/v1/auth/login/options");
    await c.post("/v1/auth/login/verify", { challengeId: o1.body.challengeId, response: { id: credentialId, counter: 5 } });
    const o2 = await c.post("/v1/auth/login/options");
    // Ongeldige handtekening (fail) met lagere teller: geweigerd, maar GEEN kloonalarm.
    expect((await c.post("/v1/auth/login/verify", { challengeId: o2.body.challengeId, response: { id: credentialId, counter: 1, fail: true } })).status).toBe(401);
    expect(await db.query("SELECT 1 FROM audit_log WHERE action = 'auth.counter_regression'")).toHaveLength(0);
  });

  it("kloondetectie: authentieke teruglopende teller wordt geweigerd en gelogd", async () => {
    const { app, db } = await setup();
    const { credentialId } = await registerUser(app, "Dirk");
    const login = async (counter: number) => {
      const c = client(app);
      const opt = await c.post("/v1/auth/login/options");
      return c.post("/v1/auth/login/verify", { challengeId: opt.body.challengeId, response: { id: credentialId, counter } });
    };
    expect((await login(5)).status).toBe(200);
    expect((await login(5)).status).toBe(401);
    expect((await login(3)).status).toBe(401);
    expect((await login(6)).status).toBe(200);
    const audit = await db.query("SELECT 1 FROM audit_log WHERE action = 'auth.counter_regression'");
    expect(audit).toHaveLength(2);
  });

  it("weigert wijzigende requests zonder of met verkeerde Origin (CSRF)", async () => {
    const { app } = await setup();
    const c = client(app);
    const evil = await c.post("/v1/auth/register/options", { displayName: "Eva" }, { origin: "https://evil.example" });
    expect(evil.status).toBe(403);
    const none = await app.request("/v1/auth/register/options", { method: "POST", headers: { "content-type": "application/json" }, body: '{"displayName":"x"}' });
    expect(none.status).toBe(403);
  });

  it("begrenst het aantal inlogpogingen", async () => {
    const { app } = await setup();
    const c = client(app);
    const statuses = [];
    for (let i = 0; i < 12; i++) statuses.push((await c.post("/v1/auth/login/options")).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it("ruimt verlopen challenges op", async () => {
    const { app, db } = await setup();
    const c = client(app);
    await c.post("/v1/auth/login/options");
    await db.query("UPDATE webauthn_challenges SET expires_at = now() - interval '1 minute'");
    await c.post("/v1/auth/login/options");
    expect((await db.query("SELECT 1 FROM webauthn_challenges")).length).toBe(1);
  });
});

describe("step-up en accountbeheer", () => {
  it("step-up is gebonden aan gebruiker en target, en eenmalig", async () => {
    const { app } = await setup();
    const a = await registerUser(app, "Anna");
    const b = await registerUser(app, "Bram");
    const target = T.passkey(a.credentialId);
    // Zonder step-up → 403
    expect((await a.c.del(`/v1/me/passkeys/${a.credentialId}`, {})).status).toBe(400);
    // Step-up voor een ander target werkt niet
    const wrong = await a.su("org:00000000-0000-0000-0000-000000000000:invite");
    expect((await a.c.del(`/v1/me/passkeys/${a.credentialId}`, { stepUp: wrong })).body.error.code).toBe("step_up_invalid");
    // Step-up van een andere gebruiker werkt niet
    const foreign = await b.su(target);
    expect((await a.c.del(`/v1/me/passkeys/${a.credentialId}`, { stepUp: foreign })).body.error.code).toBe("step_up_invalid");
  });

  it("extra passkey toevoegen, laatste passkey is beschermd, intrekken met step-up", async () => {
    const { app } = await setup();
    const a = await registerUser(app, "Anna");
    expect((await a.c.del(`/v1/me/passkeys/${a.credentialId}`, { stepUp: await a.su(T.passkey(a.credentialId)) })).status).toBe(409);
    const opt = await a.c.post("/v1/me/passkeys/options");
    expect((await a.c.post("/v1/me/passkeys/verify", { challengeId: opt.body.challengeId, response: { id: "yubikey-1" } })).status).toBe(201);
    expect((await a.c.get("/v1/me/passkeys")).body).toHaveLength(2);
    expect((await a.c.del(`/v1/me/passkeys/yubikey-1`, { stepUp: await a.su(T.passkey("yubikey-1")) })).status).toBe(204);
    expect((await a.c.get("/v1/me/passkeys")).body).toHaveLength(1);
  });

  it("alle andere sessies beëindigen", async () => {
    const { app } = await setup();
    const a = await registerUser(app, "Anna");
    const other = client(app);
    const opt = await other.post("/v1/auth/login/options");
    await other.post("/v1/auth/login/verify", { challengeId: opt.body.challengeId, response: { id: a.credentialId } });
    expect((await other.get("/v1/me")).status).toBe(200);
    expect((await a.c.post("/v1/me/sessions/revoke-others")).body.revoked).toBe(1);
    expect((await other.get("/v1/me")).status).toBe(401);
    expect((await a.c.get("/v1/me")).status).toBe(200);
  });

  it("encryptiesleutel: precies 32 bytes, eenmalig, alleen met step-up", async () => {
    const { app } = await setup();
    const a = await registerUser(app, "Anna");
    const key = Buffer.alloc(32, 7).toString("base64");
    const su = () => a.su(T.encKey(a.user.id));
    expect((await a.c.put("/v1/me/encryption-key", { alg: "x25519", publicKey: key })).status).toBe(400);
    expect((await a.c.put("/v1/me/encryption-key", { alg: "x25519", publicKey: Buffer.alloc(31).toString("base64"), stepUp: await su() })).status).toBe(400);
    expect((await a.c.put("/v1/me/encryption-key", { alg: "x25519", publicKey: key, stepUp: await su() })).status).toBe(201);
    expect((await a.c.put("/v1/me/encryption-key", { alg: "x25519", publicKey: key, stepUp: await su() })).status).toBe(409);
  });

  it("passkey met lange credential-ID kan worden ingetrokken", async () => {
    const { app } = await setup();
    const a = await registerUser(app, "Anna");
    const longId = "L".repeat(900);
    const opt = await a.c.post("/v1/me/passkeys/options");
    await a.c.post("/v1/me/passkeys/verify", { challengeId: opt.body.challengeId, response: { id: longId } });
    expect((await a.c.del(`/v1/me/passkeys/${longId}`, { stepUp: await a.su(T.passkey(longId)) })).status).toBe(204);
  });
});
