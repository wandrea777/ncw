import { describe, expect, it } from "vitest";
import { ASSETS, createPriceSeries, flowKey, valueAssetYear, type AddressHistory, type Flow } from "../src";

const BTC = 100_000_000n;
const day = (s: string) => Date.parse(`${s}T12:00:00Z`);

// Koers 1-1-2025 = 40.000, 1-6-2025 = 50.000, 1-1-2026 = 60.000
const prices = createPriceSeries("BTC", "test", [
  ["2025-01-01", 40_000],
  ["2025-03-01", 45_000],
  ["2025-06-01", 50_000],
  ["2025-09-01", 55_000],
  ["2026-01-01", 60_000],
]);

function hist(address: string, flows: Array<Omit<Flow, "address">>): AddressHistory {
  const fs = flows.map((f) => ({ ...f, address }));
  return { address, asset: ASSETS.bitcoin, flows: fs, currentBalance: fs.reduce((a, f) => a + f.delta, 0n) };
}

const opts = { year: 2025, asset: ASSETS.bitcoin, prices, classifications: {}, now: Date.UTC(2027, 0, 1) };

describe("waardering crypto", () => {
  it("alleen aanhouden: rendement = koersstijging", () => {
    const h = hist("a", [{ id: "t0", timestamp: day("2024-05-01"), delta: 1n * BTC }]);
    const r = valueAssetYear({ ...opts, histories: [h] });
    expect(r.valueBegin).toBe(40_000);
    expect(r.valueEnd).toBe(60_000);
    expect(r.werkelijkRendement).toBe(20_000);
  });

  it("aankoop midden in het jaar telt als inbreng, niet als rendement", () => {
    const h = hist("a", [{ id: "t1", timestamp: day("2025-06-01"), delta: 1n * BTC }]);
    const r = valueAssetYear({ ...opts, histories: [h] });
    expect(r.inbreng).toBe(50_000);
    expect(r.werkelijkRendement).toBe(10_000); // 60k - 0 - 50k
  });

  it("verkoop telt als onttrekking", () => {
    const h = hist("a", [
      { id: "t0", timestamp: day("2024-05-01"), delta: 1n * BTC },
      { id: "t2", timestamp: day("2025-09-01"), delta: -1n * BTC },
    ]);
    const r = valueAssetYear({ ...opts, histories: [h] });
    expect(r.onttrekking).toBe(55_000);
    expect(r.werkelijkRendement).toBe(15_000); // 0 - 40k + 55k
  });

  it("opbrengst (staking/airdrop) telt als rendement", () => {
    const h = hist("a", [{ id: "r1", timestamp: day("2025-03-01"), delta: BTC / 10n }]);
    const key = flowKey({ id: "r1", address: "a" });
    const r = valueAssetYear({ ...opts, histories: [h], classifications: { [key]: "opbrengst" } });
    expect(r.opbrengsten).toBe(4_500);
    expect(r.inbreng).toBe(0);
    expect(r.werkelijkRendement).toBe(6_000); // 0.1 × 60k
  });

  it("interne overboeking valt weg, fee telt niet als verlies", () => {
    const fee = 10_000n; // 0.0001 BTC
    const a = hist("a", [
      { id: "t0", timestamp: day("2024-05-01"), delta: 1n * BTC },
      { id: "x", timestamp: day("2025-06-01"), delta: -(BTC / 2n) - fee },
    ]);
    const b = hist("b", [{ id: "x", timestamp: day("2025-06-01"), delta: BTC / 2n }]);
    const r = valueAssetYear({ ...opts, histories: [a, b] });
    const unitsEnd = 1 - 0.0001;
    // rendement = eind - begin - inbreng + onttrekking = (unitsEnd×60k) - 40k - 25k + 25.005k
    expect(r.werkelijkRendement).toBeCloseTo(unitsEnd * 60_000 - 40_000 + 5, 2);
    expect(r.flows.filter((f) => f.internal)).toHaveLength(2);
  });

  it("waarschuwt bij inconsistent saldo", () => {
    const h = { ...hist("a", [{ id: "t0", timestamp: day("2024-05-01"), delta: 1n * BTC }]), currentBalance: 2n * BTC };
    const r = valueAssetYear({ ...opts, histories: [h] });
    expect(r.warnings.length).toBe(1);
  });

  it("markeert lopend jaar als indicatief", () => {
    const h = hist("a", [{ id: "t0", timestamp: day("2024-05-01"), delta: 1n * BTC }]);
    const r = valueAssetYear({ ...opts, histories: [h], now: day("2025-09-02") });
    expect(r.indicatief).toBe(true);
    expect(r.priceEnd).toBe(60_000); // laatste beschikbare koers
  });
});
