import { z } from "@hono/zod-openapi";

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const MAX_CIPHERTEXT_B64 = 90_000; // ≈ 64 KB binair

/** Strikte base64: moet exact terug te coderen zijn (geen stille afkapping) en minimaal `minBytes` lang. */
const strictBase64 = (minBytes: number, maxLen: number) =>
  z
    .string()
    .max(maxLen)
    .regex(BASE64, "geen geldige base64")
    .refine((s) => s.length % 4 === 0 && Buffer.from(s, "base64").toString("base64") === s, "geen canonieke base64")
    .refine((s) => Buffer.from(s, "base64").length >= minBytes, `minimaal ${minBytes} bytes`);

// 16 bytes = minimaal één AEAD-authenticatietag.
export const Ciphertext = strictBase64(16, MAX_CIPHERTEXT_B64).openapi({
  description: "Client-side versleutelde data (base64, AEAD). De server kan dit niet lezen.",
});
export const PublicKey32 = strictBase64(32, 64).refine((s) => Buffer.from(s, "base64").length === 32, "precies 32 bytes");
export const WrappedKey = strictBase64(32, 700);
export const KeyId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "alleen letters, cijfers, - en _");

export const Encryption = z
  .object({
    alg: z.enum(["xchacha20poly1305", "aes-256-gcm"]),
    keyId: KeyId,
    nonce: strictBase64(12, 64),
  })
  .strict()
  .openapi("Encryption");

export const Role = z.enum(["owner", "approver", "viewer"]).openapi("Role");
export const Uuid = z.uuid();

export const ErrorBody = z
  .object({ error: z.object({ code: z.string(), message: z.string(), requestId: z.string().optional() }) })
  .openapi("Error");

export const errorResponses = {
  400: { description: "Ongeldige invoer", content: { "application/json": { schema: ErrorBody } } },
  401: { description: "Niet ingelogd", content: { "application/json": { schema: ErrorBody } } },
  403: { description: "Geen toegang", content: { "application/json": { schema: ErrorBody } } },
  404: { description: "Niet gevonden", content: { "application/json": { schema: ErrorBody } } },
  409: { description: "Conflict", content: { "application/json": { schema: ErrorBody } } },
  429: { description: "Te veel verzoeken", content: { "application/json": { schema: ErrorBody } } },
} as const;

export const json = <T extends z.ZodType>(schema: T, description = "OK") => ({
  description,
  content: { "application/json": { schema } },
});

export const body = <T extends z.ZodType>(schema: T) => ({
  body: { required: true, content: { "application/json": { schema } } },
});

export const toB64 = (b: Uint8Array | Buffer | null) => (b ? Buffer.from(b).toString("base64") : null);
export const fromB64 = (s: string) => Buffer.from(s, "base64");
