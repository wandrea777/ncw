import { describe, expect, it } from "vitest";
import { LEDGER_VENDOR_ID, LedgerError, openSession, pickLedger, toLedgerError, versionAtLeast, webHidSupported, type AppLike, type HidLike } from "../src/lib/ledger";

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
    expect(toLedgerError({ statusCode: 0x6982 }).code).toBe("locked");
    for (const name of ["TransportRaceCondition", "InvalidStateError", "NotAllowedError"]) expect(toLedgerError({ name }).code).toBe("busy");
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

  describe("sessie openen (nep-apparaat)", () => {
    const XPUB = "tpubDC8msFGeGuwnKG9Upg7DM2b4DaRqg3CUZa5g8v2SRQ6K4NSkxUgd7HsL2XVWbVm39yBA4LAxysQAm397zwQSQoQgewGiYZqrA9DsP4zbQ1M";
    function fakeApp(name: string, version = "2.2.0", fail?: { statusCode: number }) {
      const calls: string[] = [];
      const app: AppLike<string> = {
        getAppAndVersion: async () => ({ name, version }),
        getMasterFingerprint: async () => "73c5da0a",
        getExtendedPubkey: async (path, display) => (calls.push(`xpub ${path} ${display}`), XPUB),
        getWalletAddress: async (policy, _h, change, index, display) => (calls.push(`addr ${policy} ${change}/${index} ${display}`), "tb1qtest"),
        signPsbt: async (psbt, policy) => {
          calls.push(`sign ${policy} ${psbt}`);
          if (fail) throw fail;
          return [[0, { pubkey: new Uint8Array([2, 1]), signature: new Uint8Array([48, 1]) }]];
        },
      };
      return { app, calls };
    }
    const policy = (template: string, key: string) => `${template}|${key}`;
    const noClose = async () => undefined;

    it("weigert de mainnet-app, een andere app en een te oude versie", async () => {
      await expect(openSession(fakeApp("Bitcoin").app, policy, noClose)).rejects.toMatchObject({ code: "mainnet-app" });
      await expect(openSession(fakeApp("Ethereum").app, policy, noClose)).rejects.toMatchObject({ code: "wrong-app" });
      await expect(openSession(fakeApp("BOLOS").app, policy, noClose)).rejects.toMatchObject({ code: "wrong-app" });
      await expect(openSession(fakeApp("Bitcoin Test", "2.0.6").app, policy, noClose)).rejects.toMatchObject({ code: "old-app" });
    });

    it("vraagt de xpub stil op het BIP-84-testnetpad en bouwt de wallet policy met key origin", async () => {
      const { app, calls } = fakeApp("Bitcoin Test");
      const s = await openSession(app, policy, noClose);
      expect(s.account).toEqual({ fingerprint: "73c5da0a", xpub: XPUB });
      expect(calls[0]).toBe("xpub m/84'/1'/0' false");
      await s.address(0, 3);
      await s.showAddress(1, 2);
      expect(calls.slice(1)).toEqual([`addr wpkh(@0/**)|[73c5da0a/84'/1'/0']${XPUB} 0/3 false`, `addr wpkh(@0/**)|[73c5da0a/84'/1'/0']${XPUB} 1/2 true`]);
    });

    it("geeft handtekeningen als bytes door en vertaalt een weigering op het apparaat", async () => {
      const ok = await openSession(fakeApp("Bitcoin Test").app, policy, noClose);
      expect(await ok.signOnDevice("cHNidP8=")).toEqual([{ inputIndex: 0, pubkey: new Uint8Array([2, 1]), signature: new Uint8Array([48, 1]) }]);
      const rejected = await openSession(fakeApp("Bitcoin Test", "2.2.0", { statusCode: 0x6985 }).app, policy, noClose);
      await expect(rejected.signOnDevice("cHNidP8=")).rejects.toMatchObject({ code: "rejected" });
    });

    it("sluiten slikt fouten van de transportlaag in", async () => {
      let closed = 0;
      const s = await openSession(fakeApp("Bitcoin Test").app, policy, async () => {
        closed++;
        throw new Error("al dicht");
      });
      await expect(s.close()).resolves.toBeUndefined();
      expect(closed).toBe(1);
    });
  });
});
