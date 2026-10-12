import { describe, expect, it } from "vitest";
import { withRetry, type FetchLike } from "../src";

describe("withRetry", () => {
  it("probeert opnieuw bij 429 en geeft daarna het goede antwoord", async () => {
    let calls = 0;
    const f: FetchLike = async () => ({ ok: ++calls >= 3, status: calls >= 3 ? 200 : 429, json: async () => ({}) });
    const res = await withRetry(f, { baseDelayMs: 1 })("x");
    expect(res.status).toBe(200);
    expect(calls).toBe(3);
  });

  it("geeft op na het maximum aantal pogingen", async () => {
    let calls = 0;
    const f: FetchLike = async () => (calls++, { ok: false, status: 503, json: async () => ({}) });
    const res = await withRetry(f, { retries: 2, baseDelayMs: 1 })("x");
    expect(res.status).toBe(503);
    expect(calls).toBe(3);
  });

  it("probeert niet opnieuw bij 404", async () => {
    let calls = 0;
    const f: FetchLike = async () => (calls++, { ok: false, status: 404, json: async () => ({}) });
    await withRetry(f, { baseDelayMs: 1 })("x");
    expect(calls).toBe(1);
  });
});
