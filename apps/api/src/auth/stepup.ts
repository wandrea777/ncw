import { z } from "@hono/zod-openapi";
import type { Db } from "../db/db.ts";
import type { PasskeyService } from "./webauthn.ts";
import { appendAudit, SYSTEM_CHAIN } from "../lib/audit.ts";
import { ApiError, unauthorized } from "../lib/errors.ts";
import { Uuid } from "../lib/schemas.ts";

export const WebAuthnResponse = z.object({ id: z.string().min(1).max(1024) }).passthrough();
export const StepUp = z
  .object({ challengeId: Uuid, response: WebAuthnResponse })
  .openapi("StepUp", { description: "Verse passkey-bevestiging, verkregen via POST /v1/auth/step-up/options met hetzelfde target." });
export const StepUpTarget = z.string().regex(/^[A-Za-z0-9:_-]{3,1200}$/);

/**
 * Verifieert een passkey-assertie en werkt de teller atomair bij.
 *  - Kloondetectie ná verificatie van de handtekening: een authentieke teller die niet oploopt (terwijl hij eerder > 0 was)
 *    wordt geweigerd en gelogd. Vervalste verzoeken kunnen zo geen valse alarmen in het auditlog schrijven.
 *  - De update is voorwaardelijk op de oude teller, zodat twee gelijktijdige verzoeken met dezelfde assertie niet allebei slagen.
 */
export async function verifyAssertion(
  db: Db,
  passkeys: PasskeyService,
  args: { response: { id: string }; challenge: string; expectedUserId?: string },
): Promise<{ userId: string; credentialId: string }> {
  const pk = (
    await db.query<{ credential_id: string; user_id: string; public_key: Uint8Array; counter: string; transports: string[] }>(
      "SELECT credential_id, user_id, public_key, counter::text AS counter, transports FROM passkeys WHERE credential_id = $1",
      [args.response.id],
    )
  )[0];
  if (!pk || (args.expectedUserId && pk.user_id !== args.expectedUserId)) throw unauthorized();
  const stored = Number(pk.counter);
  let newCounter: number;
  try {
    ({ newCounter } = await passkeys.verifyAuthentication({
      response: args.response,
      challenge: args.challenge,
      passkey: { credentialId: pk.credential_id, publicKey: new Uint8Array(pk.public_key), counter: stored, transports: pk.transports },
    }));
  } catch {
    throw unauthorized();
  }
  if (stored > 0 && newCounter <= stored) {
    await db.transaction((tx) =>
      appendAudit(tx, { chain: SYSTEM_CHAIN, actorId: pk.user_id, action: "auth.counter_regression", target: `passkey:${pk.credential_id}`, details: { stored, reported: newCounter } }),
    );
    throw unauthorized();
  }
  const updated = await db.query(
    "UPDATE passkeys SET counter = $2, last_used_at = now() WHERE credential_id = $1 AND counter = $3 RETURNING 1",
    [pk.credential_id, newCounter, stored],
  );
  if (!updated.length) throw unauthorized();
  return { userId: pk.user_id, credentialId: pk.credential_id };
}

/**
 * Step-up: een gevoelige actie vereist een verse passkey-bevestiging die gebonden is aan precies
 * deze gebruiker en dit target (bijv. "proposal:<id>:approve"). Een gestolen sessiecookie alleen is niet genoeg.
 */
export async function requireStepUp(
  db: Db,
  passkeys: PasskeyService,
  userId: string,
  target: string,
  stepUp: z.infer<typeof StepUp> | undefined,
): Promise<void> {
  if (!stepUp) throw new ApiError(403, "step_up_required", "Bevestig deze actie met je passkey.");
  const ch = (
    await db.query<{ challenge: string }>(
      "DELETE FROM webauthn_challenges WHERE id = $1 AND purpose = 'stepup' AND user_id = $2 AND target = $3 AND expires_at > now() RETURNING challenge",
      [stepUp.challengeId, userId, target],
    )
  )[0];
  if (!ch) throw new ApiError(403, "step_up_invalid", "Passkey-bevestiging ontbreekt, is verlopen of hoort bij een andere actie.");
  await verifyAssertion(db, passkeys, { response: stepUp.response, challenge: ch.challenge, expectedUserId: userId });
}

export const targets = {
  decision: (proposalId: string, decision: "approve" | "reject") => `proposal:${proposalId}:${decision}`,
  cancel: (proposalId: string) => `proposal:${proposalId}:cancel`,
  invite: (orgId: string) => `org:${orgId}:invite`,
  confirmMember: (orgId: string, userId: string) => `org:${orgId}:member:${userId}:confirm`,
  changeRole: (orgId: string, userId: string) => `org:${orgId}:member:${userId}:role`,
  removeMember: (orgId: string, userId: string) => `org:${orgId}:member:${userId}:remove`,
  createVault: (orgId: string) => `org:${orgId}:vault:create`,
  deletePasskey: (credentialId: string) => `passkey:${credentialId}:delete`,
  wrapKeys: (orgId: string) => `org:${orgId}:keys:wrap`,
  revokeInvite: (orgId: string, invitationId: string) => `org:${orgId}:invitation:${invitationId}:revoke`,
  registerEncryptionKey: (userId: string) => `user:${userId}:encryption-key`,
};
