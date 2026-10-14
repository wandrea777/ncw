import { describe, expect, it } from "vitest";
import { ASSETS, berekenBox3, box3ReportCsv, csvNumber, csvText, type AssetYearResult, type Box3Input } from "../src";

const input: Box3Input = {
  year: 2025,
  banktegoedenBegin: 10_000,
  overigeBezittingenBegin: 0,
  cryptoBegin: 50_000,
  schuldenBegin: 0,
  ontvangenRente: 150,
  overigeWerkelijkRendement: 0,
  cryptoWerkelijkRendement: -5_000,
  betaaldeRente: 0,
};

const btc: AssetYearResult = {
  asset: ASSETS.bitcoin,
  year: 2025,
  unitsBegin: 0.5,
  unitsEnd: 0.6,
  priceBegin: 100_000,
  priceEnd: 75_000,
  valueBegin: 50_000,
  valueEnd: 45_000,
  inbreng: 10_000,
  onttrekking: 0,
  opbrengsten: 0,
  werkelijkRendement: -15_000,
  indicatief: false,
  warnings: [],
  flows: [
    { id: "=HYPERLINK(\"https://evil\")", address: "bc1qtest", timestamp: Date.UTC(2025, 5, 1), delta: 10_000_000n, priceEur: 100_000, valueEur: 10_000, direction: "in", internal: false, classification: null },
    { id: "tx2", address: "bc1qtest", timestamp: Date.UTC(2025, 2, 1), delta: -1_000n, priceEur: 90_000, valueEur: 0.9, direction: "uit", internal: false, classification: null },
  ],
};

describe("Box 3-rapport (CSV)", () => {
  it("schrijft getallen met decimale komma, zonder duizendtallen", () => {
    expect(csvNumber(1234567.891)).toBe("1234567,89");
    expect(csvNumber(-0.5)).toBe("-0,50");
    expect(csvNumber(0.00012345, 8)).toBe("0,00012345");
    expect(csvNumber(Number.NaN)).toBe("");
  });

  it("beschermt tegen CSV-injectie en quote lastige tekens", () => {
    expect(csvText("=SUM(A1)")).toBe("'=SUM(A1)");
    for (const c of ["+", "-", "@", "\t"]) expect(csvText(`${c}x`).startsWith("'")).toBe(true);
    expect(csvText('a;b"c')).toBe('"a;b""c"');
    expect(csvText("gewoon")).toBe("gewoon");
  });

  it("bevat peildatumwaarden, overig vermogen, de uitkomst en alle transacties op datum", () => {
    const result = berekenBox3(input);
    const csv = box3ReportCsv({ input, result, assets: [btc], generatedAt: new Date("2026-10-14T12:00:00Z") });
    expect(csv.startsWith("﻿KERN Box 3-overzicht;2025\r\n")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toContain("BTC;Saldo 1 januari 2025;0,50000000");
    expect(lines).toContain("BTC;Waarde 1 januari 2026 (EUR);45000,00");
    expect(lines).toContain("BTC;Werkelijk rendement (EUR);-15000,00");
    expect(lines).toContain("Overig;Banktegoeden 1 januari 2025;10000,00");
    expect(lines).toContain(`Uitkomst;Belasting forfaitair;${csvNumber(result.forfaitair.belasting)}`);
    expect(lines).toContain(`Uitkomst;Tegenbewijsregeling voordeliger;${result.owrGunstiger ? "ja" : "nee"}`);
    const tx = lines.slice(lines.indexOf("Munt;Datum (UTC);Richting;Hoeveelheid;Koers (EUR);Waarde (EUR);Soort;Adres;Transactie-ID") + 1);
    expect(tx).toHaveLength(2);
    expect(tx[0]).toBe("BTC;2025-03-01;uit;-0,00001000;90000,00;0,90;onttrekking;bc1qtest;tx2");
    // Het transactie-ID van een vreemde API kan geen formule worden.
    expect(tx[1]).toBe(`BTC;2025-06-01;in;0,10000000;100000,00;10000,00;inbreng;bc1qtest;"'=HYPERLINK(""https://evil"")"`);
  });
});
