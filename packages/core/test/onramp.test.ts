import { describe, expect, it } from "vitest";
import { ONRAMP_PARTNERS, OnrampError, buildOnrampUrl, isValidPartnerKey, parseEuroAmount } from "../src";

const BTC = "bc1q9smlf9r3n2phajx8q97a85m0zufs7zre42t939";
const ETH = "0x14f03A8CacE4D2D6F8d744E2f8C1f9Bf5Accc9d4";
const ramp = { provider: "ramp" as const, env: "demo" as const, publicKey: "test_host_key_123" };
const moon = { provider: "moonpay" as const, env: "production" as const, publicKey: "pk_live_abcdef123" };

describe("koopknop via partner (doorverwijzing)", () => {
  it("Ramp: juiste host, munt, euro en vooringevuld adres", () => {
    const u = new URL(buildOnrampUrl(ramp, { chain: "bitcoin", address: BTC, eur: 100, returnUrl: "https://kern.example/#/wallet" }));
    expect(u.origin + u.pathname).toBe("https://app.demo.rampnetwork.com/");
    expect(u.searchParams.get("hostApiKey")).toBe("test_host_key_123");
    expect(u.searchParams.get("enabledCryptoAssets")).toBe("BTC_BTC");
    expect(u.searchParams.get("fiatCurrency")).toBe("EUR");
    expect(u.searchParams.get("fiatValue")).toBe("100");
    expect(u.searchParams.get("userAddress")).toBe(BTC);
    expect(u.searchParams.get("finalUrl")).toBe("https://kern.example/#/wallet");
    expect(u.searchParams.get("enabledFlows")).toBe("ONRAMP");
    expect(u.searchParams.get("selectedCountryCode")).toBe("NL");
    // Geen logo-URL: de partnerpagina zou anders bij onze host aankloppen.
    expect(u.searchParams.has("hostLogoUrl")).toBe(false);
  });

  it("productie gaat naar de productie-host", () => {
    expect(buildOnrampUrl({ ...ramp, env: "production" }, { chain: "ethereum" })).toMatch(/^https:\/\/app\.rampnetwork\.com\//);
  });

  it("MoonPay krijgt nooit een adres mee (zou een server-handtekening vereisen → server ziet adressen)", () => {
    const u = new URL(buildOnrampUrl(moon, { chain: "ethereum", address: ETH, eur: 50 }));
    expect(u.origin).toBe("https://buy.moonpay.com");
    expect(u.searchParams.get("currencyCode")).toBe("eth");
    expect(u.searchParams.get("baseCurrencyAmount")).toBe("50");
    expect(u.toString()).not.toContain(ETH);
    expect(u.toString().toLowerCase()).not.toContain(ETH.toLowerCase());
    expect(ONRAMP_PARTNERS.moonpay.prefillsAddress).toBe(false);
  });

  it("weigert een adres van de verkeerde munt of met een foute checksum", () => {
    expect(() => buildOnrampUrl(ramp, { chain: "ethereum", address: BTC })).toThrow(OnrampError);
    expect(() => buildOnrampUrl(ramp, { chain: "bitcoin", address: BTC.slice(0, -1) + "x" })).toThrow(OnrampError);
  });

  it("weigert ongeldige bedragen en een ontbrekende of rare sleutel", () => {
    for (const eur of [0, 9, 10_001, 12.5, Number.NaN]) expect(() => buildOnrampUrl(ramp, { chain: "bitcoin", eur })).toThrow(OnrampError);
    expect(() => buildOnrampUrl({ ...ramp, publicKey: "" }, { chain: "bitcoin" })).toThrow(OnrampError);
    expect(() => buildOnrampUrl({ ...ramp, publicKey: "a&b=c\"<script>" }, { chain: "bitcoin" })).toThrow(OnrampError);
  });

  it("geen http- of javascript-terugkeer-URL (alleen https)", () => {
    for (const returnUrl of ["http://localhost/#/wallet", "javascript:alert(1)", "geen url"]) {
      expect(new URL(buildOnrampUrl(ramp, { chain: "bitcoin", returnUrl })).searchParams.has("finalUrl")).toBe(false);
      expect(new URL(buildOnrampUrl(moon, { chain: "bitcoin", returnUrl })).searchParams.has("redirectURL")).toBe(false);
    }
  });

  it("partnersleutel en bedragen", () => {
    expect(isValidPartnerKey("pk_live_abcdef12")).toBe(true);
    expect(isValidPartnerKey("pk_1")).toBe(false);
    expect(isValidPartnerKey("a b c d e f g h")).toBe(false);
    expect(parseEuroAmount("")).toBeNull();
    expect(parseEuroAmount(" 250 ")).toBe(250);
    for (const s of ["12,50", "1.000", "1.000,00", "-5", "1e3", "100000"]) expect(parseEuroAmount(s)).toBe("invalid");
  });

  it("linkt alleen naar deze vier hosts (expliciete lijst, niet uit de code afgeleid)", () => {
    const allowed = ["https://app.demo.rampnetwork.com", "https://app.rampnetwork.com", "https://buy-sandbox.moonpay.com", "https://buy.moonpay.com"];
    for (const env of ["demo", "production"] as const)
      for (const provider of ["ramp", "moonpay"] as const) {
        const u = new URL(buildOnrampUrl({ provider, env, publicKey: "pk_test_12345678" }, { chain: "bitcoin" }));
        expect(allowed).toContain(u.origin);
      }
  });
});
