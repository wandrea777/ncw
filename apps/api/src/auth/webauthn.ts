import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { Config } from "../config.ts";

export interface StoredPasskey {
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
}

export interface RegistrationResult {
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
}

/**
 * Abstractie rond WebAuthn, zodat tests een nep-authenticator kunnen injecteren.
 * Productie gebruikt SimpleWebAuthn met user verification VERPLICHT (PIN/biometrie).
 */
export interface PasskeyService {
  registrationOptions(args: { userId: string; displayName: string; excludeCredentialIds?: string[] }): Promise<{ challenge: string; options: unknown }>;
  verifyRegistration(args: { response: unknown; challenge: string }): Promise<RegistrationResult>;
  authenticationOptions(args?: { allowCredentialIds?: string[] }): Promise<{ challenge: string; options: unknown }>;
  /**
   * Verifieert de handtekening. De tellercontrole doet de aanroeper zelf, ná verificatie, zodat alleen
   * authentieke tellerregressies als mogelijke kloon worden gelogd (geen valse alarmen door vervalste data).
   */
  verifyAuthentication(args: { response: unknown; challenge: string; passkey: StoredPasskey }): Promise<{ newCounter: number }>;
}

export function createPasskeyService(cfg: Config): PasskeyService {
  return {
    async registrationOptions({ userId, displayName, excludeCredentialIds = [] }) {
      const options = await generateRegistrationOptions({
        excludeCredentials: excludeCredentialIds.map((id) => ({ id })),
        rpName: cfg.rpName,
        rpID: cfg.rpId,
        userName: displayName,
        userID: new TextEncoder().encode(userId),
        attestationType: "none",
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
        timeout: 120_000,
      });
      return { challenge: options.challenge, options };
    },
    async verifyRegistration({ response, challenge }) {
      const v = await verifyRegistrationResponse({
        response: response as never,
        expectedChallenge: challenge,
        expectedOrigin: cfg.origin,
        expectedRPID: cfg.rpId,
        requireUserVerification: true,
      });
      if (!v.verified || !v.registrationInfo) throw new Error("registratie niet geverifieerd");
      const { credential, credentialDeviceType, credentialBackedUp } = v.registrationInfo;
      return {
        credentialId: credential.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports ?? [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
      };
    },
    async authenticationOptions({ allowCredentialIds } = {}) {
      const options = await generateAuthenticationOptions({
        rpID: cfg.rpId,
        userVerification: "required",
        timeout: 120_000,
        allowCredentials: allowCredentialIds?.map((id) => ({ id })),
      });
      return { challenge: options.challenge, options };
    },
    async verifyAuthentication({ response, challenge, passkey }) {
      const v = await verifyAuthenticationResponse({
        response: response as never,
        expectedChallenge: challenge,
        expectedOrigin: cfg.origin,
        expectedRPID: cfg.rpId,
        requireUserVerification: true,
        // Teller 0 → de bibliotheek slaat haar eigen tellercontrole over; wij controleren ná de handtekening.
        credential: { id: passkey.credentialId, publicKey: passkey.publicKey as never, counter: 0, transports: passkey.transports as never },
      });
      if (!v.verified) throw new Error("authenticatie niet geverifieerd");
      return { newCounter: v.authenticationInfo.newCounter };
    },
  };
}
