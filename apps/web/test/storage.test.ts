import { beforeEach, describe, expect, it } from "vitest";

const mem = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    get length() { return mem.size; },
  },
};
Object.defineProperty((globalThis as { window: { localStorage: object } }).window.localStorage, "keys", { value: () => [...mem.keys()] });
// Object.keys(localStorage) in de browser = opgeslagen sleutels; hier nabootsen.
const ls = (globalThis as unknown as { window: { localStorage: Record<string, unknown> } }).window.localStorage;
const { clearDevice, loadWatched, saveWatched } = await import("../src/lib/storage");
const BTC = "bc1q9smlf9r3n2phajx8q97a85m0zufs7zre42t939";

beforeEach(() => mem.clear());

describe("opslag van gevolgde adressen", () => {
  it("bewaart en laadt per gebruiker", () => {
    saveWatched("u1", [{ address: BTC, chain: "bitcoin", addedAt: 1 }]);
    expect(loadWatched("u1")).toHaveLength(1);
    expect(loadWatched("u2")).toEqual([]);
  });
  it("negeert gemanipuleerde of kapotte data in plaats van te crashen", () => {
    mem.set("kern.watch.v1.u1", "{kapot");
    expect(loadWatched("u1")).toEqual([]);
    mem.set(
      "kern.watch.v1.u1",
      JSON.stringify([
        { address: BTC, chain: "bitcoin", addedAt: 1 },
        { address: BTC.slice(0, -1) + "x", chain: "bitcoin", addedAt: 1 }, // checksum klopt niet
        { address: BTC, chain: "ethereum", addedAt: 1 }, // verkeerde chain
        { address: BTC.toUpperCase(), chain: "bitcoin", addedAt: 1 }, // niet genormaliseerd
        { address: "x", chain: "solana", addedAt: 1 },
        { address: "<script>", chain: "ethereum" },
        { address: "a".repeat(500), chain: "ethereum", addedAt: 1 },
        null,
      ]),
    );
    expect(loadWatched("u1").map((w) => w.address)).toEqual([BTC]);
  });
  it("clearDevice wist alleen KERN-sleutels", () => {
    mem.set("kern.watch.v1.u1", "[]");
    mem.set("kern.lang", "EN");
    mem.set("ander", "1");
    for (const k of mem.keys()) Object.defineProperty(ls, k, { value: mem.get(k), enumerable: true, configurable: true });
    clearDevice();
    expect([...mem.keys()]).toEqual(["ander"]);
  });
});
