import { describe, expect, it } from "vitest";
import { HDKey } from "@scure/bip32";
import { TEST_NETWORK, Transaction, p2wpkh } from "@scure/btc-signer";
import { base64, hex } from "@scure/base";
import {
  ACCOUNT_PATH,
  SendError,
  accountDeriver,
  attachPrevTxs,
  broadcast,
  fetchFeeRates,
  finalizeSigned,
  formatBtc,
  looksLike,
  parseBtcAmount,
  parseRecipient,
  planSend,
  scanAccount,
  verifyPlan,
  type AccountState,
  type DeviceSignature,
  type LedgerAccount,
  type Utxo,
} from "../src/send/bitcoin";

// ALLEEN IN TESTS: de openbare BIP-39-testvector "abandon ×11 about" (zonder wachtwoord) speelt de Ledger na.
// De productiecode maakt of gebruikt nooit privésleutels (check MICA-1).
const SEED = hex.decode(
  "5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4",
);
const VERSIONS = { private: 0x04358394, public: 0x043587cf };
const master = HDKey.fromMasterSeed(SEED, VERSIONS);
const accountKey = master.derive(ACCOUNT_PATH);
const ACCOUNT: LedgerAccount = { fingerprint: master.fingerprint.toString(16).padStart(8, "0"), xpub: accountKey.publicExtendedKey };
const privFor = (change: 0 | 1, index: number) => accountKey.deriveChild(change).deriveChild(index).privateKey!;

const derive = accountDeriver(ACCOUNT);
const OTHER = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"; // BIP-173-testvector (testnet)
const TAPROOT = "tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c"; // BIP-350-testvector

/** Een vorige transactie die `amount` naar `script` stuurt. */
function prevTx(script: Uint8Array, amount: bigint, salt = 0) {
  const t = new Transaction({ allowUnknownOutputs: true });
  t.addOutput({ script, amount });
  t.addInput({ txid: new Uint8Array(32).fill(salt + 1), index: 0, finalScriptSig: new Uint8Array([0x51]) });
  return { raw: hex.encode(t.toBytes(true, false)), id: t.id };
}

function stateWith(values: Array<[bigint, boolean]>): { state: AccountState; raws: Map<string, string> } {
  const raws = new Map<string, string>();
  const utxos: Utxo[] = values.map(([value, confirmed], i) => {
    const owner = derive(0, i);
    const p = prevTx(owner.script, value, i);
    raws.set(p.id, p.raw);
    return { txid: p.id, vout: 0, value, confirmed, owner };
  });
  return {
    state: {
      utxos,
      confirmed: utxos.filter((u) => u.confirmed).reduce((s, u) => s + u.value, 0n),
      pending: utxos.filter((u) => !u.confirmed).reduce((s, u) => s + u.value, 0n),
      nextReceive: derive(0, values.length),
      nextChange: derive(1, 0),
      used: utxos.map((u) => u.owner),
    },
    raws,
  };
}

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof SendError ? e.code : `ander: ${String(e)}`;
  }
  return "geen fout";
};

describe("hardware wallet: account (alleen publieke sleutels)", () => {
  it("leidt dezelfde adressen af als BIP-84 op testnet (testvector)", () => {
    expect(ACCOUNT.fingerprint).toBe("73c5da0a");
    expect(derive(0, 0).address).toBe("tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl");
    expect(derive(1, 0).address).not.toBe(derive(0, 0).address);
    expect(derive(0, 0).address).toMatch(/^tb1q/);
  });

  it("weigert mainnet-sleutels, privésleutels, verkeerde diepte en een rare fingerprint", () => {
    const mainnetXpub = HDKey.fromMasterSeed(SEED).derive("m/84'/0'/0'").publicExtendedKey;
    expect(code(() => accountDeriver({ ...ACCOUNT, xpub: mainnetXpub }))).toBe("account-invalid");
    expect(code(() => accountDeriver({ ...ACCOUNT, xpub: accountKey.privateExtendedKey }))).toBe("account-invalid");
    expect(code(() => accountDeriver({ ...ACCOUNT, xpub: master.publicExtendedKey }))).toBe("account-invalid");
    expect(code(() => accountDeriver({ ...ACCOUNT, fingerprint: "XYZ" }))).toBe("account-invalid");
    expect(code(() => derive(0, -1))).toBe("account-invalid");
  });
});

describe("hardware wallet: invoer controleren", () => {
  it("accepteert alleen testnet-adressen, met checksum", () => {
    expect(parseRecipient(`  ${OTHER} `)).toBe(OTHER);
    expect(parseRecipient(OTHER.toUpperCase())).toBe(OTHER);
    expect(parseRecipient(TAPROOT)).toBe(TAPROOT);
    expect(parseRecipient("mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn")).toBe("mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn");
    expect(code(() => parseRecipient("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"))).toBe("address-mainnet");
    expect(code(() => parseRecipient("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"))).toBe("address-mainnet");
    expect(code(() => parseRecipient("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsy"))).toBe("address-invalid");
    expect(code(() => parseRecipient("tb1qW508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"))).toBe("address-invalid");
    expect(code(() => parseRecipient(""))).toBe("address-empty");
  });

  it("rekent bedragen exact om naar satoshi", () => {
    expect(parseBtcAmount("0.001")).toBe(100_000n);
    expect(parseBtcAmount("0,001")).toBe(100_000n);
    expect(parseBtcAmount("1")).toBe(100_000_000n);
    expect(parseBtcAmount("0.00000546")).toBe(546n);
    expect(parseBtcAmount("21000000.12345678")).toBe(2_100_000_012_345_678n);
    for (const bad of ["", "-1", "1.123456789", "1,000.5", "1e3", "0x10", ".5", "1."]) expect(code(() => parseBtcAmount(bad))).toBe("amount-invalid");
    expect(code(() => parseBtcAmount("0.00000545"))).toBe("amount-too-small");
  });

  it("toont bedragen zonder afrondingsfouten", () => {
    expect(formatBtc(100_000n)).toBe("0.001");
    expect(formatBtc(100_000_000n)).toBe("1");
    expect(formatBtc(123_456_789n)).toBe("1.23456789");
    expect(formatBtc(-546n)).toBe("-0.00000546");
  });

  it("herkent lijkende adressen (address poisoning), maar niet hetzelfde adres", () => {
    const real = "tb1qabcd0000000000000000000000000000wxyz";
    expect(looksLike(real, "tb1qabcd9999999999999999999999999999wxyz")).toBe(true);
    expect(looksLike(real, real)).toBe(false);
    expect(looksLike(real, real.toUpperCase())).toBe(false);
    expect(looksLike(real, "tb1qabce0000000000000000000000000000wxyz")).toBe(false);
    expect(looksLike(real, "tb1qabcd0000000000000000000000000000wxyy")).toBe(false);
  });
});

describe("hardware wallet: account scannen", () => {
  it("vindt gebruikte adressen en UTXO's tot de gap-limiet, en kiest het eerste ongebruikte adres na het laatst gebruikte", async () => {
    const usedReceive = new Set([derive(0, 0).address, derive(0, 2).address]);
    const usedChange = new Set([derive(1, 0).address]);
    const urls: string[] = [];
    const fake = async (url: string) => {
      urls.push(url);
      const m = /\/address\/([a-z0-9]+)(\/utxo)?$/.exec(url)!;
      const used = usedReceive.has(m[1]!) || usedChange.has(m[1]!);
      const body = m[2]
        ? [{ txid: "aa".repeat(32), vout: 1, value: 5000, status: { confirmed: m[1] !== derive(0, 2).address } }]
        : { chain_stats: { tx_count: used ? 1 : 0 }, mempool_stats: { tx_count: 0 } };
      return new Response(JSON.stringify(body), { status: 200 });
    };
    const s = await scanAccount(derive, { fetch: fake, gap: 3, delayMs: 0 });
    expect(urls.every((u) => u.startsWith("https://mempool.space/testnet4/api/"))).toBe(true);
    expect(s.nextReceive.index).toBe(3);
    expect(s.nextChange.index).toBe(1);
    expect(s.used.map((a) => `${a.change}/${a.index}`)).toEqual(["0/0", "0/2", "1/0"]);
    expect(s.confirmed).toBe(10_000n);
    expect(s.pending).toBe(5000n);
  });

  it("geeft een duidelijke fout als de API faalt", async () => {
    const fake = async () => new Response("nee", { status: 400 });
    await expect(scanAccount(derive, { fetch: fake, delayMs: 0 })).rejects.toMatchObject({ code: "network" });
  });

  it("begrenst de aanbevolen netwerkvergoeding", async () => {
    const fake = async () => new Response(JSON.stringify({ fastestFee: 5000, halfHourFee: 2.2, hourFee: 0 }), { status: 200 });
    expect(await fetchFeeRates(fake)).toEqual({ fast: 1000n, normal: 3n, slow: 1n });
  });
});

describe("hardware wallet: transactie bouwen en controleren", () => {
  it("bouwt een PSBT met de ontvanger, wisselgeld naar een eigen adres en afleidingspaden voor de Ledger", () => {
    const { state, raws } = stateWith([[60_000n, true], [50_000n, true], [1_000_000n, false]]);
    const plan = attachPrevTxs(planSend({ account: ACCOUNT, state, recipient: OTHER, amount: 70_000n, feeRate: 2n }), raws);
    const tx = Transaction.fromPSBT(base64.decode(plan.psbt));
    // De onbevestigde UTXO van 1.000.000 sat wordt niet gebruikt.
    expect(plan.inputs.every((u) => u.confirmed)).toBe(true);
    expect(tx.inputsLength).toBe(2);
    expect(plan.amount + plan.fee + plan.change).toBe(110_000n);
    expect(plan.fee).toBeGreaterThan(0n);
    expect(plan.fee).toBeLessThan(1000n);
    for (let i = 0; i < tx.inputsLength; i++) {
      const inp = tx.getInput(i);
      expect(inp.nonWitnessUtxo).toBeDefined();
      const [, d] = inp.bip32Derivation![0]!;
      expect(d.fingerprint).toBe(0x73c5da0a);
      expect(d.path.slice(0, 4)).toEqual([0x80000054, 0x80000001, 0x80000000, 0]);
    }
    const changeOut = [...Array(tx.outputsLength).keys()].map((i) => tx.getOutput(i)).find((o) => o.bip32Derivation);
    expect(changeOut?.amount).toBe(plan.change);
    expect(changeOut?.bip32Derivation?.[0]?.[1].path).toEqual([0x80000054, 0x80000001, 0x80000000, 1, 0]);
  });

  it("weigert bij te weinig bevestigd saldo, een te hoge vergoeding of een te klein bedrag", () => {
    const { state } = stateWith([[10_000n, true], [1_000_000n, false]]);
    const base = { account: ACCOUNT, state, recipient: OTHER, feeRate: 2n };
    expect(code(() => planSend({ ...base, amount: 20_000n }))).toBe("insufficient-funds");
    expect(code(() => planSend({ ...base, amount: 5000n, feeRate: 1001n }))).toBe("fee-invalid");
    expect(code(() => planSend({ ...base, amount: 5000n, feeRate: 0n }))).toBe("fee-invalid");
    expect(code(() => planSend({ ...base, amount: 545n }))).toBe("amount-too-small");
    expect(code(() => planSend({ ...base, amount: 5000n, recipient: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4" }))).toBe("address-mainnet");
  });

  it("de onafhankelijke controle vangt een extra uitvoer, een verkeerd bedrag en een te hoge vergoeding", () => {
    const { state } = stateWith([[100_000n, true]]);
    const change = state.nextChange;
    const want = { recipient: OTHER, amount: 50_000n, changeScript: change.script, feeRate: 2n };
    const make = (outs: Array<[Uint8Array, bigint]>) => {
      const t = new Transaction({ allowUnknownOutputs: true });
      t.addInput({ txid: hex.decode(state.utxos[0]!.txid), index: 0, witnessUtxo: { script: state.utxos[0]!.owner.script, amount: 100_000n } });
      for (const [script, amount] of outs) t.addOutput({ script, amount });
      return t;
    };
    const recipientScript = p2wpkh(hex.decode("0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"), TEST_NETWORK).script;
    const toOther = hex.decode("0014751e76e8199196d454941c45d1b3a323f1433bd6"); // script van OTHER (BIP-173)
    expect(verifyPlan(make([[toOther, 50_000n], [change.script, 49_800n]]), want).fee).toBe(200n);
    expect(code(() => verifyPlan(make([[toOther, 50_000n], [change.script, 49_000n], [recipientScript, 700n]]), want))).toBe("plan-mismatch");
    expect(code(() => verifyPlan(make([[toOther, 49_999n], [change.script, 49_800n]]), want))).toBe("plan-mismatch");
    expect(code(() => verifyPlan(make([[toOther, 50_000n], [change.script, 10_000n]]), want))).toBe("plan-mismatch");
    expect(code(() => verifyPlan(make([[toOther, 25_000n], [toOther, 25_000n], [change.script, 49_800n]]), want))).toBe("plan-mismatch");
  });

  it("weigert een vorige transactie die niet bij de invoer past (fee-aanval via een liegende API)", () => {
    const { state, raws } = stateWith([[60_000n, true]]);
    const plan = () => planSend({ account: ACCOUNT, state, recipient: OTHER, amount: 10_000n, feeRate: 2n });
    const txid = state.utxos[0]!.txid;
    const lying = prevTx(state.utxos[0]!.owner.script, 6_000_000n, 0);
    expect(code(() => attachPrevTxs(plan(), new Map([[txid, lying.raw]])))).toBe("utxo-mismatch");
    expect(code(() => attachPrevTxs(plan(), new Map()))).toBe("utxo-mismatch");
    expect(code(() => attachPrevTxs(plan(), new Map([[txid, "zz"]])))).toBe("utxo-mismatch");
    expect(code(() => attachPrevTxs(plan(), raws))).toBe("geen fout");
  });
});

describe("hardware wallet: handtekeningen verwerken en uitzenden", () => {
  /** Speelt de Ledger na: ondertekent elke invoer met de sleutel uit `bip32Derivation`. */
  function deviceSign(psbt: string): DeviceSignature[] {
    const tx = Transaction.fromPSBT(base64.decode(psbt));
    const sigs: DeviceSignature[] = [];
    for (let i = 0; i < tx.inputsLength; i++) {
      const [, d] = tx.getInput(i).bip32Derivation![0]!;
      tx.signIdx(privFor(d.path[3] as 0 | 1, d.path[4]!), i);
      const [pubkey, signature] = tx.getInput(i).partialSig![0]!;
      sigs.push({ inputIndex: i, pubkey, signature });
    }
    return sigs;
  }

  const signedPlan = () => {
    const { state, raws } = stateWith([[60_000n, true], [50_000n, true]]);
    return attachPrevTxs(planSend({ account: ACCOUNT, state, recipient: OTHER, amount: 70_000n, feeRate: 2n }), raws);
  };

  it("maakt een geldige transactie af met de handtekeningen van het apparaat", () => {
    const plan = signedPlan();
    const out = finalizeSigned(plan.psbt, deviceSign(plan.psbt));
    const tx = Transaction.fromRaw(hex.decode(out.hex));
    expect(out.txid).toBe(tx.id);
    expect(tx.inputsLength).toBe(2);
    // De schatting in verifyPlan is echt een bovengrens.
    expect(tx.vsize).toBeLessThanOrEqual(plan.vsize);
    expect(tx.vsize).toBeGreaterThan(plan.vsize - 40);
  });

  it("weigert ontbrekende, dubbele of vreemde handtekeningen", () => {
    const plan = signedPlan();
    const sigs = deviceSign(plan.psbt);
    expect(code(() => finalizeSigned(plan.psbt, sigs.slice(0, 1)))).toBe("signature-mismatch");
    expect(code(() => finalizeSigned(plan.psbt, [sigs[0]!, sigs[0]!]))).toBe("signature-mismatch");
    expect(code(() => finalizeSigned(plan.psbt, [sigs[0]!, { ...sigs[1]!, pubkey: sigs[0]!.pubkey }]))).toBe("signature-mismatch");
    expect(code(() => finalizeSigned(plan.psbt, [sigs[0]!, { ...sigs[1]!, inputIndex: 7 }]))).toBe("signature-mismatch");
  });

  it("zendt uit via mempool.space testnet4 en controleert het teruggegeven transactie-ID", async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const ok = (async (url: string, init?: RequestInit) => (calls.push([url, init]), new Response("ab".repeat(32)))) as typeof fetch;
    expect(await broadcast({ hex: "00", txid: "ab".repeat(32) }, ok)).toBe("ab".repeat(32));
    expect(calls[0]![0]).toBe("https://mempool.space/testnet4/api/tx");
    expect(calls[0]![1]?.method).toBe("POST");
    const other = (async () => new Response("cd".repeat(32))) as typeof fetch;
    await expect(broadcast({ hex: "00", txid: "ab".repeat(32) }, other)).rejects.toMatchObject({ code: "network" });
    const refused = (async () => new Response("bad-txns", { status: 400 })) as typeof fetch;
    await expect(broadcast({ hex: "00", txid: "ab".repeat(32) }, refused)).rejects.toMatchObject({ code: "network" });
  });
});
