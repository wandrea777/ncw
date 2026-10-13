import { describe, expect, it } from "vitest";
import { STRINGS, translate } from "../src/i18n";
import { formatAmount, formatPct, splitEur } from "../src/lib/format";

describe("vertalingen", () => {
  it("elke tekst bestaat in het Nederlands én Engels en is niet leeg", () => {
    for (const [key, [nl, en]] of Object.entries(STRINGS)) {
      expect(nl.trim(), key).not.toBe("");
      expect(en.trim(), key).not.toBe("");
    }
  });
  it("placeholders zijn gelijk in beide talen", () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, [nl, en]] of Object.entries(STRINGS)) expect(vars(nl), key).toEqual(vars(en));
  });
  it("vult variabelen in", () => {
    expect(translate("NL", "addressCount", { n: 2 })).toBe("2 adressen");
    expect(translate("EN", "addressCount.one", { n: 1 })).toBe("1 address");
  });
  it("bevat geen verboden veiligheids- of rendementsclaims", () => {
    const all = Object.values(STRINGS).flat().join(" ").toLowerCase();
    for (const w of ["veiligste", "100% veilig", "safest", "unhackable", "gegarandeerd", "guaranteed", "risicovrij", "risk-free"]) {
      expect(all).not.toContain(w);
    }
  });
});

describe("opmaak", () => {
  it("splitst euro's en centen zoals het ontwerp", () => {
    expect(splitEur(56497.36, "en-GB")).toEqual(["€56,497", ".36"]);
    expect(splitEur(56497.36, "nl-NL")).toEqual(["€\u00a056.497", ",36"]);
  });
  it("toont stof met significante cijfers in plaats van 0", () => {
    expect(formatAmount(0.0000000012, "ETH", "en-GB")).toBe("0.0000000012 ETH");
    expect(formatAmount(0.03037809, "BTC", "en-GB")).toBe("0.03037809 BTC");
    expect(formatAmount(0, "BTC", "en-GB")).toBe("0 BTC");
  });
  it("percentages met teken", () => {
    expect(formatPct(0.0226, "en-GB")).toBe("+2.26%");
    expect(formatPct(-0.019, "en-GB")).toBe("-1.90%");
  });
});
