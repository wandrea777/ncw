import { describe, expect, it } from "vitest";
import { looksLikeSecret } from "../src/lib/secrets";

describe("looksLikeSecret", () => {
  it("herkent een BIP-39-herstelzin van 12 en 24 woorden", () => {
    expect(looksLikeSecret("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about")).toBe(true);
    expect(looksLikeSecret(Array(24).fill("zoo").join(" "))).toBe(true);
  });
  it("herkent ruwe privésleutels, WIF en xprv", () => {
    expect(looksLikeSecret("0x" + "ab".repeat(32))).toBe(true);
    expect(looksLikeSecret("ab".repeat(32))).toBe(true);
    expect(looksLikeSecret("5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ")).toBe(true);
    expect(looksLikeSecret("xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi")).toBe(true);
  });
  it("laat publieke adressen en xpubs door", () => {
    expect(looksLikeSecret("bc1q9smlf9r3n2phajx8q97a85m0zufs7zre42t939")).toBe(false);
    expect(looksLikeSecret("0x14f03A8CacE4D2D6F8d744E2f8C1f9Bf5Accc9d4")).toBe(false);
    expect(looksLikeSecret("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")).toBe(false);
    expect(looksLikeSecret("xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8")).toBe(false);
  });
  it("herkent herstelzinnen met komma's, regeleinden, nummering en in andere talen", () => {
    expect(looksLikeSecret("abandon,abandon,abandon,abandon,abandon,abandon,abandon,abandon,abandon,abandon,abandon,about")).toBe(true);
    expect(looksLikeSecret("1. abandon\n2. abandon\n3. abandon\n4. abandon\n5. abandon\n6. abandon\n7. abandon\n8. abandon\n9. abandon\n10. abandon\n11. abandon\n12. about")).toBe(true);
    expect(looksLikeSecret("ábaco abdomen abeja abierto abogado abono aborto abrazo abrir abuelo abuso acabar")).toBe(true);
    expect(looksLikeSecret("zprvAWgYBBk7JR8Gjrh4UJQ2uJdG1r3WNRRfURiABBE3RvMXYSrRJL62XuezvGdPvG6GFBZduosCc1YP5wixPox7zhZLfiUm8aunE96BBa4Kei5")).toBe(true);
  });
  it("een gewoon adres met cijfers wordt nooit als woorden gezien", () => {
    expect(looksLikeSecret("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")).toBe(false);
    expect(looksLikeSecret("bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297")).toBe(false);
  });
  it("herkent een Chinese herstelzin (één teken per woord) en een sleutel midden in andere tekst", () => {
    expect(looksLikeSecret("的 一 是 在 不 了 有 和 人 这 中 大")).toBe(true);
    expect(looksLikeSecret("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq " + "ab".repeat(32))).toBe(true);
  });
  it("een korte zin is geen herstelzin", () => {
    expect(looksLikeSecret("mijn bitcoin adres")).toBe(false);
  });
});
