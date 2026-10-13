import { describe, expect, it } from "vitest";
import { ASSETS, activity, createPriceSeries, priceBook, snapshot, valueSeries, type AddressHistory } from "../src";

const DAY = 86_400_000;
const d = (s: string) => Date.parse(`${s}T00:00:00Z`);
const BTC = 100_000_000n;
const ETH = 10n ** 18n;

const btcPrices = priceBook([
  createPriceSeries("BTC", "test", [
    ["2026-10-11", 50_000],
    ["2026-10-12", 60_000],
    ["2026-10-13", 66_000],
  ]),
]);
const ethPrices = priceBook([
  createPriceSeries("ETH", "test", [
    ["2026-10-12", 2_000],
    ["2026-10-13", 1_800],
  ]),
]);

function hist(address: string, asset: AddressHistory["asset"], flows: Array<[string, string, bigint]>, balance?: bigint): AddressHistory {
  const fs = flows.map(([id, t, delta]) => ({ id, address, timestamp: Date.parse(t), delta }));
  return { address, asset, flows: fs, currentBalance: balance ?? fs.reduce((a, f) => a + f.delta, 0n) };
}

describe("priceBook", () => {
  it("zoekt over meerdere jaarreeksen en geeft null bij een ontbrekende dag", () => {
    const book = priceBook([
      createPriceSeries("BTC", "t", [["2025-12-31", 1]]),
      createPriceSeries("BTC", "t", [["2026-01-01", 2]]),
    ]);
    expect(book.priceOn("2025-12-31")).toBe(1);
    expect(book.priceOn("2026-01-01")).toBe(2);
    expect(book.priceOn("2024-01-01")).toBeNull();
    expect(book.lastDay()).toBe(d("2026-01-01"));
  });
});

describe("snapshot", () => {
  it("telt saldi per asset op over adressen en waardeert tegen de laatste dagkoers", () => {
    const s = snapshot(
      [
        hist("a", ASSETS.bitcoin, [["t1", "2026-10-01T10:00:00Z", BTC / 2n]]),
        hist("b", ASSETS.bitcoin, [["t2", "2026-10-02T10:00:00Z", BTC / 4n]]),
        hist("c", ASSETS.ethereum, [["t3", "2026-10-02T10:00:00Z", 2n * ETH]]),
      ],
      { BTC: btcPrices, ETH: ethPrices },
    );
    expect(s.holdings.map((h) => h.asset.symbol)).toEqual(["BTC", "ETH"]); // hoogste waarde eerst
    const btc = s.holdings[0]!;
    expect(btc.amount).toBe(0.75);
    expect(btc.addresses).toBe(2);
    expect(btc.valueEur).toBe(49_500);
    expect(btc.change).toBeCloseTo(0.1);
    expect(s.holdings[1]!.valueEur).toBe(3_600);
    expect(s.totalEur).toBe(53_100);
    // gisteren: 0,75 × 60.000 + 2 × 2.000 = 49.000
    expect(s.changeEur).toBeCloseTo(4_100);
    expect(s.change).toBeCloseTo(4_100 / 49_000);
    expect(s.priceDay).toBe(d("2026-10-13"));
  });

  it("gebruikt het saldo van de bron, niet de som van flows", () => {
    const s = snapshot([hist("a", ASSETS.bitcoin, [["t1", "2026-10-01T00:00:00Z", BTC]], BTC / 10n)], { BTC: btcPrices });
    expect(s.holdings[0]!.amount).toBe(0.1);
  });

  it("geeft geen dagwijziging als de koers van gisteren ontbreekt", () => {
    const book = priceBook([createPriceSeries("BTC", "t", [["2026-10-13", 10]])]);
    const s = snapshot([hist("a", ASSETS.bitcoin, [["t", "2026-10-01T00:00:00Z", BTC]])], { BTC: book });
    expect(s.holdings[0]!.change).toBeNull();
    expect(s.changeEur).toBeNull();
    expect(s.change).toBeNull();
  });

  it("faalt luid als koersen voor een asset ontbreken", () => {
    expect(() => snapshot([hist("a", ASSETS.ethereum, [])], { BTC: btcPrices })).toThrow(/ETH/);
  });

  it("lege portefeuille is nul", () => {
    expect(snapshot([], {})).toMatchObject({ holdings: [], totalEur: 0 });
  });
});

describe("valueSeries", () => {
  it("waardeert het saldo aan het begin van elke dag tegen de dagopening", () => {
    const h = [hist("a", ASSETS.bitcoin, [["t1", "2026-10-11T12:00:00Z", BTC], ["t2", "2026-10-12T12:00:00Z", -BTC / 2n]])];
    const pts = valueSeries(h, { BTC: btcPrices }, d("2026-10-13"), 3);
    expect(pts).toEqual([
      { t: d("2026-10-11"), valueEur: 0 }, // flow pas later op de dag
      { t: d("2026-10-12"), valueEur: 60_000 },
      { t: d("2026-10-13"), valueEur: 33_000 },
    ]);
  });

  it("slaat dagen zonder koers over in plaats van nul te tonen", () => {
    const h = [hist("a", ASSETS.ethereum, [["t1", "2026-10-01T00:00:00Z", ETH]])];
    const pts = valueSeries(h, { ETH: ethPrices }, d("2026-10-13"), 3);
    expect(pts.map((p) => p.t)).toEqual([d("2026-10-12"), d("2026-10-13")]);
  });

  it("geeft precies `days` punten als alle koersen er zijn", () => {
    const h = [hist("a", ASSETS.bitcoin, [])];
    expect(valueSeries(h, { BTC: btcPrices }, d("2026-10-13"), 3)).toHaveLength(3);
    expect(d("2026-10-13") - d("2026-10-12")).toBe(DAY);
  });
});

describe("activity", () => {
  it("sorteert nieuwste eerst en bepaalt ontvangen/verstuurd", () => {
    const items = activity([
      hist("a", ASSETS.bitcoin, [["in1", "2026-10-01T00:00:00Z", BTC], ["out1", "2026-10-05T00:00:00Z", -BTC / 2n]]),
    ]);
    expect(items.map((i) => [i.id, i.type, i.amount])).toEqual([
      ["out1", "send", 0.5],
      ["in1", "receive", 1],
    ]);
  });

  it("voegt één transactie over twee eigen adressen samen tot een interne overboeking", () => {
    const items = activity([
      hist("a", ASSETS.bitcoin, [["tx", "2026-10-01T00:00:00Z", -BTC]]),
      hist("b", ASSETS.bitcoin, [["tx", "2026-10-01T00:00:00Z", BTC - 1_000n]]),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "internal", delta: -1_000n });
  });

  it("een verzending met wisselgeld naar een ander eigen adres is een verzending van het netto bedrag", () => {
    // A stuurt 1 BTC weg: 0,6 naar een extern adres, 0,39999 als wisselgeld naar gevolgd adres B, 0,00001 fee.
    const items = activity([
      hist("a", ASSETS.bitcoin, [["tx", "2026-10-01T00:00:00Z", -BTC]]),
      hist("b", ASSETS.bitcoin, [["tx", "2026-10-01T00:00:00Z", 39_999_000n]]),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "send", delta: -60_001_000n });
    expect(items[0]!.amount).toBeCloseTo(0.60001);
  });

  it("precies op de fee-grens is nog intern, net erboven niet", () => {
    const at = (net: bigint) =>
      activity([
        hist("a", ASSETS.bitcoin, [["tx", "2026-10-01T00:00:00Z", -BTC]]),
        hist("b", ASSETS.bitcoin, [["tx", "2026-10-01T00:00:00Z", BTC - net]]),
      ])[0]!.type;
    expect(at(100_000n)).toBe("internal");
    expect(at(100_001n)).toBe("send");
  });

  it("houdt dezelfde hash op verschillende chains gescheiden", () => {
    const items = activity([
      hist("a", ASSETS.bitcoin, [["x", "2026-10-01T00:00:00Z", 1n]]),
      hist("b", ASSETS.ethereum, [["x", "2026-10-01T00:00:00Z", 1n]]),
    ]);
    expect(items).toHaveLength(2);
  });
});
