import { describe, expect, it } from "vitest";
import { fetchEthereumHistory, txDelta, type FetchLike } from "../src";

describe("bitcoin txDelta", () => {
  it("telt outputs op en trekt inputs af", () => {
    const tx = {
      txid: "t",
      status: { confirmed: true, block_time: 1 },
      vin: [{ prevout: { scriptpubkey_address: "me", value: 1000 } }, { prevout: { scriptpubkey_address: "x", value: 5 } }],
      vout: [{ scriptpubkey_address: "other", value: 700 }, { scriptpubkey_address: "me", value: 250 }],
    };
    expect(txDelta(tx, "me")).toBe(-750n);
  });
});

describe("ethereum historie", () => {
  it("volgt paginering en sorteert oplopend", async () => {
    const pages: Record<string, unknown> = {
      "": {
        items: [
          { block_timestamp: "2025-02-01T00:00:00Z", delta: "-5", transaction_hash: "0xb", block_number: 2, value: "15" },
        ],
        next_page_params: { block_number: 2, items_count: 1 },
      },
      "?block_number=2&items_count=1": {
        items: [
          { block_timestamp: "2025-01-01T00:00:00Z", delta: "20", transaction_hash: "0xa", block_number: 1, value: "20" },
        ],
        next_page_params: null,
      },
    };
    const fetchFn: FetchLike = async (url) => {
      const q = url.includes("?") ? url.slice(url.indexOf("?")) : "";
      return { ok: true, status: 200, json: async () => pages[q] };
    };
    const h = await fetchEthereumHistory("0xabc", fetchFn);
    expect(h.currentBalance).toBe(15n);
    expect(h.flows.map((f) => f.id)).toEqual(["0xa", "0xb"]);
    expect(h.flows.reduce((a, f) => a + f.delta, 0n)).toBe(h.currentBalance);
  });
});
