import { describe, expect, it } from "vitest";
import { T, orgWithMembers, registerUser } from "./helpers.ts";

describe("organisaties, uitnodigingen en rollen", () => {
  it("maker wordt eigenaar; bevestigde leden zien elkaar", async () => {
    const { owner, org, invite } = await orgWithMembers();
    expect(org.role).toBe("owner");
    await invite("approver", "Bestuurder");
    const members = await owner.c.get(`/v1/orgs/${org.id}/members`);
    expect(members.body.map((m: { role: string }) => m.role).sort()).toEqual(["approver", "owner"]);
  });

  it("uitnodiging kan nooit eigenaarschap geven", async () => {
    const { owner, org } = await orgWithMembers();
    const r = await owner.c.post(`/v1/orgs/${org.id}/invitations`, { role: "owner", stepUp: await owner.su(T.invite(org.id)) });
    expect(r.status).toBe(400);
  });

  it("uitnodigen vereist step-up", async () => {
    const { owner, org } = await orgWithMembers();
    expect((await owner.c.post(`/v1/orgs/${org.id}/invitations`, { role: "viewer" })).status).toBe(400);
  });

  it("geaccepteerde uitnodiging = pending: geen toegang tot bevestiging met veiligheidscode", async () => {
    const { owner, org, invite } = await orgWithMembers();
    const m = await invite("approver", "Nieuw", { confirm: false });
    expect(m.safetyCode).toMatch(/^\d{3} \d{3}$/);
    expect((await m.c.get(`/v1/orgs/${org.id}/members`)).status).toBe(404);
    const list = (await owner.c.get(`/v1/orgs/${org.id}/members`)).body;
    const pending = list.find((x: { userId: string }) => x.userId === m.user.id);
    expect(pending.status).toBe("pending");
    expect(pending.safetyCode).toBe(m.safetyCode); // eigenaar ziet dezelfde code → telefonisch vergelijken
    await owner.c.post(`/v1/orgs/${org.id}/members/${m.user.id}/confirm`, { stepUp: await owner.su(T.confirm(org.id, m.user.id)) });
    expect((await m.c.get(`/v1/orgs/${org.id}/members`)).status).toBe(200);
  });

  it("uitnodigingscode is eenmalig en intrekbaar", async () => {
    const { app, owner, org } = await orgWithMembers();
    const inv = (await owner.c.post(`/v1/orgs/${org.id}/invitations`, { role: "viewer", stepUp: await owner.su(T.invite(org.id)) })).body;
    const a = await registerUser(app, "A");
    const b = await registerUser(app, "B");
    expect((await a.c.post("/v1/invitations/accept", { code: inv.code })).status).toBe(200);
    expect((await b.c.post("/v1/invitations/accept", { code: inv.code })).status).toBe(410);
    const inv2 = (await owner.c.post(`/v1/orgs/${org.id}/invitations`, { role: "viewer", stepUp: await owner.su(T.invite(org.id)) })).body;
    expect((await owner.c.del(`/v1/orgs/${org.id}/invitations/${inv2.id}`, {})).status).toBe(400); // zonder step-up
    expect((await owner.c.del(`/v1/orgs/${org.id}/invitations/${inv2.id}`, { stepUp: await owner.su(T.revokeInvite(org.id, inv2.id)) })).status).toBe(204);
    expect((await b.c.post("/v1/invitations/accept", { code: inv2.code })).status).toBe(410);
    const statuses = (await owner.c.get(`/v1/orgs/${org.id}/invitations`)).body.map((i: { status: string }) => i.status).sort();
    expect(statuses).toEqual(["accepted", "revoked"]);
  });

  it("verlopen uitnodiging en dubbel lidmaatschap", async () => {
    const { app, db, owner, org, invite } = await orgWithMembers();
    const inv = (await owner.c.post(`/v1/orgs/${org.id}/invitations`, { role: "viewer", stepUp: await owner.su(T.invite(org.id)) })).body;
    await db.query("UPDATE invitations SET expires_at = now() - interval '1 second' WHERE id = $1", [inv.id]);
    const x = await registerUser(app, "X");
    expect((await x.c.post("/v1/invitations/accept", { code: inv.code })).status).toBe(410);
    const m = await invite("viewer", "Lid");
    const again = (await owner.c.post(`/v1/orgs/${org.id}/invitations`, { role: "viewer", stepUp: await owner.su(T.invite(org.id)) })).body;
    expect((await m.c.post("/v1/invitations/accept", { code: again.code })).status).toBe(409);
  });

  it("pending lid kan zichzelf terugtrekken", async () => {
    const { owner, org, invite } = await orgWithMembers();
    const m = await invite("viewer", "Twijfelaar", { confirm: false });
    expect((await m.c.del(`/v1/orgs/${org.id}/members/${m.user.id}`, { stepUp: await m.su(T.remove(org.id, m.user.id)) })).status).toBe(204);
    expect((await owner.c.get(`/v1/orgs/${org.id}/members`)).body).toHaveLength(1);
  });

  it("reviewer-scenario: stemmen, verwijderd, heruitgenodigd en bevestigd → kan opnieuw stemmen, voorstel loopt niet vast", async () => {
    const { owner, org, invite, createVault, propose, decide } = await orgWithMembers();
    const a = await invite("approver", "A");
    const b = await invite("approver", "B");
    const v = (await createVault([owner.user.id, a.user.id, b.user.id], 2)).body;
    const p = (await propose(owner, v.id)).body;
    await decide(b, p.id, "approve");
    await owner.c.del(`/v1/orgs/${org.id}/members/${b.user.id}`, { stepUp: await owner.su(T.remove(org.id, b.user.id)) });
    await decide(a, p.id, "approve").then((r) => expect(r.body.status).toBe("pending"));
    // b opnieuw uitnodigen met hetzelfde account en bevestigen
    const inv = (await owner.c.post(`/v1/orgs/${org.id}/invitations`, { role: "approver", stepUp: await owner.su(T.invite(org.id)) })).body;
    await b.c.post("/v1/invitations/accept", { code: inv.code });
    await owner.c.post(`/v1/orgs/${org.id}/members/${b.user.id}/confirm`, { stepUp: await owner.su(T.confirm(org.id, b.user.id)) });
    expect((await owner.c.get(`/v1/proposals/${p.id}`)).body.status).toBe("pending"); // oude stem herleeft niet
    const again = await decide(b, p.id, "approve"); // geen 409 meer: kan opnieuw stemmen
    expect(again.status).toBe(200);
    expect(again.body.status).toBe("approved");
  });

  it("niet-leden krijgen 404 (bestaan wordt verborgen)", async () => {
    const { app, org } = await orgWithMembers();
    const stranger = await registerUser(app, "Vreemde");
    expect((await stranger.c.get(`/v1/orgs/${org.id}/members`)).status).toBe(404);
    expect((await stranger.c.get(`/v1/orgs/${org.id}/vaults`)).status).toBe(404);
    expect((await stranger.c.get(`/v1/orgs/${org.id}/audit`)).status).toBe(404);
  });

  it("viewer (boekhouder) kan lezen maar niet beheren", async () => {
    const { owner, org, invite, createVault } = await orgWithMembers();
    const viewer = await invite("viewer", "Boekhouder");
    expect((await viewer.c.get(`/v1/orgs/${org.id}/audit`)).status).toBe(200);
    expect((await viewer.c.post(`/v1/orgs/${org.id}/invitations`, { role: "viewer", stepUp: await viewer.su(T.invite(org.id)) })).status).toBe(403);
    expect((await createVault([owner.user.id, owner.user.id], 2, viewer)).status).toBe(403);
  });

  it("niet-eigenaar kan geen anderen verwijderen; wel zichzelf", async () => {
    const { org, invite } = await orgWithMembers();
    const a = await invite("approver", "A");
    const b = await invite("approver", "B");
    expect((await a.c.del(`/v1/orgs/${org.id}/members/${b.user.id}`, { stepUp: await a.su(T.remove(org.id, b.user.id)) })).status).toBe(403);
    expect((await a.c.del(`/v1/orgs/${org.id}/members/${a.user.id}`, { stepUp: await a.su(T.remove(org.id, a.user.id)) })).status).toBe(204);
    expect((await a.c.get(`/v1/orgs/${org.id}/members`)).status).toBe(404); // geen toegang meer na verwijderen
  });

  it("laatste eigenaar beschermd; met twee eigenaren kan de een de ander degraderen", async () => {
    const { owner, org, invite } = await orgWithMembers();
    expect((await owner.c.patch(`/v1/orgs/${org.id}/members/${owner.user.id}`, { role: "viewer", stepUp: await owner.su(T.role(org.id, owner.user.id)) })).status).toBe(409);
    expect((await owner.c.del(`/v1/orgs/${org.id}/members/${owner.user.id}`, { stepUp: await owner.su(T.remove(org.id, owner.user.id)) })).status).toBe(409);
    const m = await invite("approver", "Tweede");
    expect((await owner.c.patch(`/v1/orgs/${org.id}/members/${m.user.id}`, { role: "owner", stepUp: await owner.su(T.role(org.id, m.user.id)) })).body.role).toBe("owner");
    expect((await m.c.patch(`/v1/orgs/${org.id}/members/${owner.user.id}`, { role: "approver", stepUp: await m.su(T.role(org.id, owner.user.id)) })).status).toBe(200);
  });

  it("alles komt in een intacte auditketen, met head-hash", async () => {
    const { owner, org, invite } = await orgWithMembers();
    const m = await invite("viewer", "Lid");
    await owner.c.patch(`/v1/orgs/${org.id}/members/${m.user.id}`, { role: "approver", stepUp: await owner.su(T.role(org.id, m.user.id)) });
    await owner.c.del(`/v1/orgs/${org.id}/members/${m.user.id}`, { stepUp: await owner.su(T.remove(org.id, m.user.id)) });
    const audit = (await owner.c.get(`/v1/orgs/${org.id}/audit`)).body;
    expect(audit.entries.map((e: { action: string }) => e.action)).toEqual([
      "org.created",
      "invitation.created",
      "member.requested",
      "member.confirmed",
      "member.role_changed",
      "member.removed",
    ]);
    expect(audit.integrity.ok).toBe(true);
    expect(audit.integrity.head).toBe(audit.entries.at(-1).hash);
  });

  it("organisatiesleutel inpakken alleen voor actieve leden; lid haalt eigen sleutel op", async () => {
    const { app, owner, org, invite } = await orgWithMembers();
    const m = await invite("approver", "Lid");
    const stranger = await registerUser(app, "Vreemde");
    const wrapped = Buffer.alloc(80, 1).toString("base64");
    const bad = await owner.c.put(`/v1/orgs/${org.id}/wrapped-keys`, { keyId: "k1", entries: [{ userId: stranger.user.id, wrappedKey: wrapped }], stepUp: await owner.su(T.wrap(org.id)) });
    expect(bad.status).toBe(400);
    const ok = await owner.c.put(`/v1/orgs/${org.id}/wrapped-keys`, { keyId: "k1", entries: [{ userId: m.user.id, wrappedKey: wrapped }], stepUp: await owner.su(T.wrap(org.id)) });
    expect(ok.status).toBe(200);
    expect((await m.c.get(`/v1/orgs/${org.id}/wrapped-keys/me`)).body).toEqual([{ keyId: "k1", wrappedKey: wrapped, wrappedBy: owner.user.id }]);
    expect((await m.c.put(`/v1/orgs/${org.id}/wrapped-keys`, { keyId: "k2", entries: [{ userId: m.user.id, wrappedKey: wrapped }], stepUp: await m.su(T.wrap(org.id)) })).status).toBe(403);
  });
});
