import { test } from "node:test";
import assert from "node:assert/strict";
import { stripComments, usesPrivateKeyApi } from "../keyrules.mjs";

test("MICA-1: vangt API's die privésleutels maken of in software ondertekenen", () => {
  for (const code of [
    "const k = HDKey.fromMasterSeed(seed);",
    "const s = mnemonicToSeedSync(words);",
    "generateMnemonic(wordlist)",
    "const pk = utils.randomPrivateKeyBytes();",
    "tx.signIdx(pk, 0);",
    "psbt.signAllInputs(kp)",
    "const sig = secp256k1.sign(msg, key);",
    "schnorr.sign(m, k)",
    "ECPair.fromWIF(w)",
    "if (key.privateKey) {}",
    "tx.sign(pk);",
    "c.sign(msg, key)",
    "const pub = secp256k1.getPublicKey(sk);",
    "obj['private' + 'Key']",
    "const f = BIP32Factory(ecc); f.fromSeed(seed);",
    'const k = "tprv8ZgxMBicQKsPd7Uf69XL1XwhmjHopUGep8GuEiJDZmbQz6o58LninorQAfcKZWARbtRtfnLcJ5MQ2AtHcQJCCRUcMRvmDUjyEmNUWwx8UbK";',
  ]) {
    assert.equal(usesPrivateKeyApi(code), true, code);
  }
});

test("MICA-1: publieke sleutels, Ledger-ondertekening en uitleg in commentaar zijn toegestaan", () => {
  for (const code of [
    "const root = HDKey.fromExtendedKey(xpub, VERSIONS);",
    "const sigs = await session.signOnDevice(psbt);",
    "secp256k1.verify(sig, digest, pubkey, { format: 'der', prehash: false })",
    "Math.sign(Number(o.delta)) !== Math.sign(Number(f.delta))",
    "app.signPsbt(psbt, policy, null)",
    "// Bitcoin WIF herkennen we als geheim",
    "/* privateKey komt hier nooit */ const x = 1;",
    'const url = "https://mempool.space/testnet4/api";',
  ]) {
    assert.equal(usesPrivateKeyApi(code), false, code);
  }
});

test("stripComments laat URL's in strings staan", () => {
  assert.equal(stripComments('const u = "https://a.example/x"; // weg'), 'const u = "https://a.example/x"; ');
  assert.equal(stripComments("a /* b */ c"), "a  c");
});
