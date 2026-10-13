import { describe, expect, it } from "vitest";
import { onrampConfig } from "../src/lib/onrampConfig";

describe("configuratie koopknop", () => {
  it("zonder partner of sleutel: niet actief (geen nepknop)", () => {
    expect(onrampConfig({})).toBeNull();
    expect(onrampConfig({ VITE_ONRAMP_PROVIDER: "ramp" })).toBeNull();
    expect(onrampConfig({ VITE_ONRAMP_PROVIDER: "onbekend", VITE_ONRAMP_KEY: "k" })).toBeNull();
  });
  it("standaard demo in ontwikkeling, productie in een productie-build", () => {
    expect(onrampConfig({ VITE_ONRAMP_PROVIDER: "ramp", VITE_ONRAMP_KEY: "key_12345678", PROD: false })?.env).toBe("demo");
    expect(onrampConfig({ VITE_ONRAMP_PROVIDER: "ramp", VITE_ONRAMP_KEY: "key_12345678", PROD: true })?.env).toBe("production");
    expect(onrampConfig({ VITE_ONRAMP_PROVIDER: "moonpay", VITE_ONRAMP_KEY: "pk_test_12345678", VITE_ONRAMP_ENV: "demo", PROD: true })?.env).toBe("demo");
  });
  it("een ongeldige sleutel of onbekende omgeving maakt de knop niet actief", () => {
    expect(onrampConfig({ VITE_ONRAMP_PROVIDER: "ramp", VITE_ONRAMP_KEY: "pk_1" })).toBeNull();
    expect(onrampConfig({ VITE_ONRAMP_PROVIDER: "ramp", VITE_ONRAMP_KEY: "key_12345678", VITE_ONRAMP_ENV: "prod", PROD: true })).toBeNull();
  });
});
