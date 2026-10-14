import { describe, expect, it } from "vitest";
import { LEDGER_VENDOR_ID, LedgerError, pickLedger, toLedgerError, versionAtLeast, webHidSupported, type HidLike } from "../src/lib/ledger";

describe("Ledger-koppeling", () => {
  it("vergelijkt app-versies (minimaal 2.1.0 voor het PSBT-protocol)", () => {
    expect(versionAtLeast("2.1.0", [2, 1, 0])).toBe(true);
    expect(versionAtLeast("2.4.1", [2, 1, 0])).toBe(true);
    expect(versionAtLeast("3.0.0", [2, 1, 0])).toBe(true);
    expect(versionAtLeast("2.0.6", [2, 1, 0])).toBe(false);
    expect(versionAtLeast("1.6.6", [2, 1, 0])).toBe(false);
    expect(versionAtLeast("2.1.0-rc", [2, 1, 0])).toBe(true);
    expect(versionAtLeast("onzin", [2, 1, 0])).toBe(false);
  });

  it("vertaalt apparaatfouten naar vaste codes (geen ruwe foutteksten in de UI)", () => {
    expect(toLedgerError({ statusCode: 0x6985 }).code).toBe("rejected");
    expect(toLedgerError({ statusCode: 0x5515 }).code).toBe("locked");
    for (const sc of [0x6e00, 0x6e01, 0x6d00, 0x6511, 0x6a82]) expect(toLedgerError({ statusCode: sc }).code).toBe("wrong-app");
    expect(toLedgerError({ name: "TransportOpenUserCancelled" }).code).toBe("cancelled");
    expect(toLedgerError({ name: "DisconnectedDeviceDuringOperation" }).code).toBe("disconnected");
    expect(toLedgerError(new Error("<script>")).code).toBe("unknown");
    const own = new LedgerError("mainnet-app");
    expect(toLedgerError(own)).toBe(own);
  });

  it("meldt geen WebHID-ondersteuning buiten de browser", () => {
    expect(webHidSupported()).toBe(false);
  });

  it("kiest een eerder toegestane Ledger, vraagt anders de kiezer, en geeft null bij annuleren", async () => {
    const ledger = { vendorId: LEDGER_VENDOR_ID };
    const other = { vendorId: 0x1234 };
    const calls: unknown[] = [];
    const hid = (known: unknown[], picked: unknown[]): HidLike => ({
      getDevices: async () => known as never,
      requestDevice: async (o) => (calls.push(o), picked as never),
    });
    expect(await pickLedger(hid([other, ledger], []))).toBe(ledger);
    expect(calls).toHaveLength(0);
    expect(await pickLedger(hid([other], [ledger]))).toBe(ledger);
    expect(calls[0]).toEqual({ filters: [{ vendorId: 0x2c97 }] });
    expect(await pickLedger(hid([], []))).toBeNull();
    expect(await pickLedger(hid([], [other]))).toBeNull();
  });
});
