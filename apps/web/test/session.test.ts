import { describe, expect, it } from "vitest";
import { ApiError, authErrorKey } from "../src/lib/api";
import { IDLE_MINUTES, canShowWallet, idleExpired, logoutConfirmed } from "../src/lib/session";

describe("sessieregels", () => {
  it("het dashboard alleen met een sessie, nooit tijdens laden of zonder sessie", () => {
    expect(canShowWallet({ user: {} })).toBe(true);
    expect(canShowWallet(null)).toBe(false);
    expect(canShowWallet(undefined)).toBe(false);
  });
  it("inactiviteit verloopt precies na de servertermijn", () => {
    const t0 = 1_000_000;
    expect(IDLE_MINUTES).toBe(30);
    expect(idleExpired(t0, t0 + 29 * 60_000 + 59_999)).toBe(false);
    expect(idleExpired(t0, t0 + 30 * 60_000)).toBe(true);
  });
  it("uitloggen geldt alleen bij bevestiging van de server of een al ongeldige sessie", () => {
    expect(logoutConfirmed(null)).toBe(true);
    expect(logoutConfirmed(new ApiError(401, "unauthorized", "x"))).toBe(true);
    expect(logoutConfirmed(new ApiError(0, "offline", "x"))).toBe(false);
    expect(logoutConfirmed(new ApiError(503, "x", "x"))).toBe(false);
    expect(logoutConfirmed(new Error("netwerk"))).toBe(false);
  });
});

describe("foutmeldingen bij inloggen", () => {
  it("een ontbrekende API (statische host: 404/405) of netwerkfout heet 'server niet bereikbaar'", () => {
    for (const s of [0, 404, 405, 500, 502]) expect(authErrorKey(new ApiError(s, "x", "x"))).toBe("auth.offline");
  });
  it("een geannuleerde of niet-ondersteunde passkey krijgt een eigen melding", () => {
    expect(authErrorKey(Object.assign(new Error(), { name: "NotAllowedError" }))).toBe("auth.cancelled");
    expect(authErrorKey(Object.assign(new Error(), { name: "NotSupportedError" }))).toBe("auth.unsupported");
  });
  it("een gewone API-fout (bijv. 400) wordt niet verstopt", () => {
    expect(authErrorKey(new ApiError(400, "bad_request", "x"))).toBeNull();
  });
});

describe("achtergrondcontrole van de sessie", () => {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const respond = (status: number, body: unknown, json = true) =>
    (globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: (init.headers ?? {}) as Record<string, string> });
      return new Response(json ? JSON.stringify(body) : String(body), { status, headers: { "content-type": json ? "application/json" : "text/html" } });
    }) as typeof fetch);

  it("stuurt de niet-verlengen-header en meldt een geldige sessie", async () => {
    const { checkSession } = await import("../src/lib/api");
    respond(200, { user: { id: "u", displayName: "A" }, passkeys: 1 });
    expect(await checkSession()).toBe("valid");
    expect(calls.at(-1)!.headers["x-kern-session-check"]).toBe("1");
  });
  it("alleen 401 is verlopen; 503, netwerkfout en een HTML-404 zijn onbekend", async () => {
    const { checkSession } = await import("../src/lib/api");
    respond(401, { error: { code: "unauthorized", message: "x" } });
    expect(await checkSession()).toBe("expired");
    respond(503, { error: { code: "unavailable", message: "x" } });
    expect(await checkSession()).toBe("unknown");
    respond(404, "<html>niet gevonden</html>", false);
    expect(await checkSession()).toBe("unknown");
    globalThis.fetch = (async () => { throw new TypeError("netwerk"); }) as typeof fetch;
    expect(await checkSession()).toBe("unknown");
  });
  it("een HTML-antwoord van een statische host wordt 'server niet bereikbaar' bij inloggen", async () => {
    const { login } = await import("../src/lib/api");
    respond(405, "<html>Method Not Allowed</html>", false);
    const err = await login().catch((e: unknown) => e);
    expect(authErrorKey(err)).toBe("auth.offline");
  });
});
