import { describe, expect, it } from "vitest";
import { buyLink } from "../src/lib/buyLink";

const BTC = "bc1q9smlf9r3n2phajx8q97a85m0zufs7zre42t939";
const ETH = "0x14f03A8CacE4D2D6F8d744E2f8C1f9Bf5Accc9d4";
const watched = [
  { address: BTC, chain: "bitcoin" as const, addedAt: 1 },
  { address: ETH, chain: "ethereum" as const, addedAt: 1 },
];
const ramp = { provider: "ramp" as const, env: "demo" as const, publicKey: "test_key_123456" };
const moon = { provider: "moonpay" as const, env: "demo" as const, publicKey: "pk_test_123456" };
const base = { chain: "bitcoin" as const, amount: "100", address: BTC, confirmedOwn: true };

describe("koopknop: welke link er ontstaat", () => {
  it("adres alleen mee na bevestiging 'beheer ik zelf'", () => {
    const yes = buyLink(ramp, base, watched, "https://kern.example");
    const no = buyLink(ramp, { ...base, confirmedOwn: false }, watched, "https://kern.example");
    expect(yes.ok && yes.prefilled && yes.url.includes(BTC)).toBe(true);
    expect(no.ok && !no.prefilled && !no.url.includes(BTC)).toBe(true);
  });
  it("nooit een adres dat niet gevolgd wordt of van een andere munt is", () => {
    const other = buyLink(ramp, { ...base, address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq" }, watched, "https://k.example");
    const wrongChain = buyLink(ramp, { ...base, chain: "ethereum", address: BTC }, watched, "https://k.example");
    expect(other.ok && !other.prefilled).toBe(true);
    expect(wrongChain.ok && !wrongChain.prefilled && !wrongChain.url.includes(BTC)).toBe(true);
  });
  it("MoonPay nooit met adres, ook niet na bevestiging", () => {
    const r = buyLink(moon, base, watched, "https://k.example");
    expect(r.ok && !r.prefilled && !r.url.includes(BTC)).toBe(true);
  });
  it("bedrag met komma, punt of buiten €10–€10.000 geeft geen link", () => {
    for (const amount of ["12,50", "1.000", "5", "20000"]) expect(buyLink(ramp, { ...base, amount }, watched, "https://k.example")).toEqual({ ok: false, reason: "amount" });
    expect(buyLink(ramp, { ...base, amount: "" }, watched, "https://k.example").ok).toBe(true);
  });
  it("terugkeer alleen naar onze eigen https-origin", () => {
    const r = buyLink(ramp, base, watched, "https://kern.example");
    expect(r.ok && new URL(r.url).searchParams.get("finalUrl")).toBe("https://kern.example/#/wallet");
  });
});
