import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export const newId = () => randomUUID();

/** 256 bit willekeurig token, base64url. */
export const randomToken = () => randomBytes(32).toString("base64url");

export const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest();
export const sha256Hex = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

export function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Deterministische JSON (gesorteerde sleutels) voor hashing. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}
