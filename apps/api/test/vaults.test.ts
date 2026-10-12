import { describe, expect, it } from "vitest";
import { CT, T, orgWithMembers } from "./helpers.ts";

async function vaultSetup() {
  const env = await orgWithMembers();
  const a1 = await env.invite("approver", "Bestuurder 1");
  const a2 = await env.invite("approver", "Bestuurder 2");
  const viewer = await env.invite("viewer", "Boekhouder");
  // 2-van-3: eigenaar, a1 en a2 houden elk één sleutel.
  const vault = (await env.createVault([env.owner.user.id, a1.user.id, a2.user.id], 2)).body;
  return { ...env, a1, a2, viewer, vault };
}

describe("kluizen en goedkeuringen", () => {
  it("bewaart de descriptor alleen als ciphertext en lekt die niet in het auditlog", async () => {
    const { db, owner, org, vault } = await vaultSetup();
    expect(vault.descriptorCiphertext).toBe(CT);
    expect(vault.signers).toHaveLength(3);
    const audit = (await owner.c.get(`/v1/orgs/${org.id}/audit`)).body;
    expect(JSON.stringify(audit)).not.toContain(CT);
    const [row] = await db.query<{ descriptor_ciphertext: Uint8Array }>("SELECT descriptor_ciphertext FROM vaults");
    expect(Buffer.from(row!.descriptor_ciphertext).toString("base64")).toBe(CT);
  });

  it("weigert een ongeldige drempel, een viewer of een niet-lid als ondertekenaar", async () => {
    const { owner, a1, viewer, createVault } = await vaultSetup();
    expect((await createVault([owner.user.id, a1.user.id], 3)).status).toBe(400);
    expect((await createVault([owner.user.id, viewer.user.id], 2)).body.error.code).toBe("invalid_signer");
    expect((await createVault([owner.user.id, crypto.randomUUID()], 2)).body.error.code).toBe("invalid_signer");
  });

  it("solo-ondernemer met 3 eigen sleutels (2-van-3) kan zelf goedkeuren", async () => {
    const { owner, createVault, propose, decide } = await orgWithMembers();
    const v = (await createVault([owner.user.id, owner.user.id, owner.user.id], 2)).body;
    const p = (await propose(owner, v.id)).body;
    expect((await decide(owner, p.id, "approve")).body.status).toBe("approved");
  });

  it("2-van-3: pas goedgekeurd na twee verschillende ondertekenaars", async () => {
    const { a1, a2, vault, propose, decide, cancel } = await vaultSetup();
    const p = (await propose(a1, vault.id)).body;
    expect((await decide(a1, p.id, "approve", { signatureCiphertext: CT })).body.status).toBe("pending");
    expect((await decide(a1, p.id, "approve")).status).toBe(409);
    const second = await decide(a2, p.id, "approve", { signatureCiphertext: CT });
    expect(second.body.status).toBe("approved");
    expect(second.body.decisions).toHaveLength(2);
    expect((await cancel(a1, p.id)).status).toBe(409);
    expect((await decide(a2, p.id, "reject")).status).toBe(409);
  });

  it("beslissen vereist een step-up voor precies deze beslissing", async () => {
    const { a1, vault, propose } = await vaultSetup();
    const p = (await propose(a1, vault.id)).body;
    expect((await a1.c.post(`/v1/proposals/${p.id}/decisions`, { decision: "approve" })).status).toBe(400);
    const forReject = await a1.su(T.decision(p.id, "reject"));
    expect((await a1.c.post(`/v1/proposals/${p.id}/decisions`, { decision: "approve", stepUp: forReject })).body.error.code).toBe("step_up_invalid");
  });

  it("afgewezen zodra de drempel onhaalbaar is", async () => {
    const { owner, a1, a2, vault, propose, decide } = await vaultSetup();
    const p = (await propose(owner, vault.id)).body;
    expect((await decide(a1, p.id, "reject")).body.status).toBe("pending");
    expect((await decide(a2, p.id, "reject")).body.status).toBe("rejected");
  });

  it("een afwijzing van een verwijderd lid telt niet meer", async () => {
    const { owner, org, a1, a2, vault, propose, decide } = await vaultSetup();
    const p = (await propose(owner, vault.id)).body;
    await decide(a1, p.id, "reject");
    await owner.c.del(`/v1/orgs/${org.id}/members/${a1.user.id}`, { stepUp: await owner.su(T.remove(org.id, a1.user.id)) });
    expect((await decide(owner, p.id, "approve")).body.status).toBe("pending");
    expect((await decide(a2, p.id, "approve")).body.status).toBe("approved");
  });

  it("een goedkeuring van een gedegradeerd lid telt niet meer", async () => {
    const { owner, org, a1, a2, vault, propose, decide } = await vaultSetup();
    const p = (await propose(owner, vault.id)).body;
    await decide(a1, p.id, "approve");
    await owner.c.patch(`/v1/orgs/${org.id}/members/${a1.user.id}`, { role: "viewer", stepUp: await owner.su(T.role(org.id, a1.user.id)) });
    expect((await decide(a2, p.id, "approve")).body.status).toBe("pending");
    expect((await decide(owner, p.id, "approve")).body.status).toBe("approved");
  });

  it("een ondertekenaar verwijderen kan een voorstel onhaalbaar maken → afgewezen", async () => {
    const { owner, org, a1, a2, vault, propose, decide } = await vaultSetup();
    const p = (await propose(owner, vault.id)).body;
    await decide(owner, p.id, "reject");
    await owner.c.del(`/v1/orgs/${org.id}/members/${a1.user.id}`, { stepUp: await owner.su(T.remove(org.id, a1.user.id)) });
    expect((await a2.c.get(`/v1/proposals/${p.id}`)).body.status).toBe("rejected");
  });

  it("alleen ondertekenaars van de kluis mogen voorstellen of beslissen", async () => {
    const { owner, invite, createVault, propose, decide } = await orgWithMembers();
    const a = await invite("approver", "Geen ondertekenaar");
    const v = (await createVault([owner.user.id, owner.user.id], 2)).body;
    expect((await propose(a, v.id)).status).toBe(403);
    const p = (await propose(owner, v.id)).body;
    expect((await decide(a, p.id, "approve")).status).toBe(403);
  });

  it("viewer mag niet voorstellen of beslissen, wel lezen", async () => {
    const { a1, viewer, vault, propose, decide } = await vaultSetup();
    expect((await propose(viewer, vault.id)).status).toBe(403);
    const p = (await propose(a1, vault.id)).body;
    expect((await decide(viewer, p.id, "approve")).status).toBe(403);
    expect((await viewer.c.get(`/v1/vaults/${vault.id}/proposals`)).status).toBe(200);
    expect((await viewer.c.get(`/v1/proposals/${p.id}`)).status).toBe(200);
  });

  it("voorstellen en kluizen van een andere organisatie zijn onzichtbaar (404)", async () => {
    const first = await vaultSetup();
    const p = (await first.propose(first.a1, first.vault.id)).body;
    const other = await orgWithMembers();
    expect((await other.owner.c.get(`/v1/proposals/${p.id}`)).status).toBe(404);
    expect((await other.owner.c.get(`/v1/vaults/${first.vault.id}`)).status).toBe(404);
    expect((await other.decide(other.owner, p.id, "approve")).status).toBe(404);
  });

  it("alleen indiener of eigenaar kan annuleren, en alleen met step-up", async () => {
    const { a1, a2, owner, vault, propose, cancel } = await vaultSetup();
    const p = (await propose(a1, vault.id)).body;
    expect((await cancel(a2, p.id)).status).toBe(403);
    expect((await owner.c.post(`/v1/proposals/${p.id}/cancel`, {})).status).toBe(400); // zonder step-up
    expect((await cancel(owner, p.id)).body.status).toBe("cancelled");
  });

  it("heruitgenodigd lid: oude stem herleeft niet, nieuwe stem telt, status wordt herberekend", async () => {
    const { owner, org, a1, a2, vault, propose, decide } = await vaultSetup();
    const p = (await propose(owner, vault.id)).body;
    await decide(a1, p.id, "approve");
    await owner.c.del(`/v1/orgs/${org.id}/members/${a1.user.id}`, { stepUp: await owner.su(T.remove(org.id, a1.user.id)) });
    expect((await owner.c.get(`/v1/proposals/${p.id}`)).body.decisions).toHaveLength(0);
    expect((await decide(a2, p.id, "approve")).body.status).toBe("pending");
    expect((await decide(owner, p.id, "approve")).body.status).toBe("approved");
  });

  it("gelijktijdige goedkeuringen worden correct geteld", async () => {
    const { owner, a1, a2, vault, propose, decide } = await vaultSetup();
    const p = (await propose(owner, vault.id)).body;
    const results = await Promise.all([owner, a1, a2].map((m) => decide(m, p.id, "approve")));
    const ok = results.filter((r) => r.status === 200);
    const conflicts = results.filter((r) => r.status === 409);
    expect(ok.length + conflicts.length).toBe(3);
    expect(ok.length).toBeGreaterThanOrEqual(2);
    const final = (await owner.c.get(`/v1/proposals/${p.id}`)).body;
    expect(final.status).toBe("approved");
    expect(final.decisions.length).toBe(ok.length);
  });
});
