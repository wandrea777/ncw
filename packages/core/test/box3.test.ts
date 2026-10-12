import { describe, expect, it } from "vitest";
import { berekenBox3, berekenForfaitair, type Box3Input } from "../src";

const leeg: Box3Input = {
  year: 2026,
  banktegoedenBegin: 0,
  overigeBezittingenBegin: 0,
  cryptoBegin: 0,
  schuldenBegin: 0,
  ontvangenRente: 0,
  overigeWerkelijkRendement: 0,
  cryptoWerkelijkRendement: 0,
  betaaldeRente: 0,
};

describe("box 3 forfaitair", () => {
  it("rekent het voorbeeld van €200.000 beleggingen in 2026 na", () => {
    // 200.000 × 6% = 12.000; grondslag 140.643; voordeel 8.438,58; belasting ≈ 3.037,89
    const r = berekenForfaitair({ ...leeg, overigeBezittingenBegin: 200_000 });
    expect(r.forfaitairRendement).toBe(12_000);
    expect(r.voordeel).toBeCloseTo(8_438.58, 2);
    expect(r.belasting).toBeCloseTo(3_037.89, 1);
  });

  it("past de schuldendrempel toe en mengt categorieën", () => {
    const r = berekenForfaitair({
      ...leeg,
      banktegoedenBegin: 50_000,
      overigeBezittingenBegin: 30_000,
      cryptoBegin: 20_000,
      schuldenBegin: 13_800,
    });
    // schulden na drempel 10.000; grondslag 90.000
    // rendement = 640 + 3.000 - 270 = 3.370
    expect(r.rendementsgrondslag).toBe(90_000);
    expect(r.forfaitairRendement).toBe(3_370);
    expect(r.voordeel).toBeCloseTo((90_000 - 59_357) * (3_370 / 90_000), 2);
  });

  it("geeft nul onder het heffingsvrij vermogen", () => {
    const r = berekenForfaitair({ ...leeg, overigeBezittingenBegin: 40_000 });
    expect(r.voordeel).toBe(0);
    expect(r.belasting).toBe(0);
  });

  it("geeft nul bij negatieve rendementsgrondslag", () => {
    const r = berekenForfaitair({ ...leeg, banktegoedenBegin: 1_000, schuldenBegin: 50_000 });
    expect(r.voordeel).toBe(0);
  });
});

describe("box 3 tegenbewijs", () => {
  it("werkelijk rendement zonder heffingsvrij vermogen, OWR gunstiger", () => {
    const r = berekenBox3({ ...leeg, overigeBezittingenBegin: 200_000, overigeWerkelijkRendement: 2_000 });
    expect(r.werkelijk.belasting).toBe(720);
    expect(r.owrGunstiger).toBe(true);
    expect(r.geschatteBesparing).toBeCloseTo(3_037.89 - 720, 1);
  });

  it("negatief werkelijk rendement geeft nul belasting", () => {
    const r = berekenBox3({ ...leeg, cryptoBegin: 100_000, cryptoWerkelijkRendement: -30_000 });
    expect(r.werkelijk.belasting).toBe(0);
    expect(r.owrGunstiger).toBe(true);
  });

  it("OWR niet gunstiger als werkelijk rendement hoger is", () => {
    const r = berekenBox3({ ...leeg, cryptoBegin: 100_000, cryptoWerkelijkRendement: 50_000 });
    expect(r.owrGunstiger).toBe(false);
    expect(r.geschatteBesparing).toBe(0);
  });

  it("betaalde rente is aftrekbaar", () => {
    const r = berekenBox3({ ...leeg, ontvangenRente: 500, betaaldeRente: 200 });
    expect(r.werkelijk.werkelijkRendement).toBe(300);
  });
});
