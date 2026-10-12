import { describe, expect, it } from "vitest";
import { checkAddress } from "../src";

describe("adresvalidatie", () => {
  it.each([
    ["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "bitcoin"],
    ["3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy", "bitcoin"],
    ["bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", "bitcoin"],
    ["bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297", "bitcoin"],
    ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "ethereum"],
    ["0xd8da6bf26964af9d7eed9e03e53415d37aa96045", "ethereum"],
  ])("accepteert %s", (addr, chain) => {
    const r = checkAddress(addr);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chain).toBe(chain);
  });

  it("normaliseert Ethereum naar EIP-55", () => {
    const r = checkAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");
    expect(r.ok && r.normalized).toBe("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
  });

  it.each([
    "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb", // checksum fout
    "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdx", // checksum fout
    "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96046", // EIP-55 fout
    "hallo",
    "",
  ])("weigert %s", (addr) => {
    expect(checkAddress(addr).ok).toBe(false);
  });
});
