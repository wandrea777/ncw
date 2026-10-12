import { describe, expect, it } from "vitest";
import { parseEur } from "../src";

describe("parseEur", () => {
  it.each([
    ["", 0],
    ["40.000", 40_000],
    ["1.234.567", 1_234_567],
    ["1.234,56", 1_234.56],
    ["1234,56", 1_234.56],
    ["1234.56", 1_234.56],
    ["-2.500,50", -2_500.5],
    ["€ 800", 800],
    ["12", 12],
  ])("%s → %s", (s, n) => expect(parseEur(s)).toBe(n));

  it.each(["abc", "1,2,3", "12.34.5", "1.23,4.5"])("weigert %s", (s) => expect(parseEur(s)).toBeNaN());
});
