// Regels voor control MICA-1 (ADR-0012, ADR-0015): onze eigen browsercode maakt, bewaart of gebruikt nooit privésleutels.
// Dit controleert eigen code, niet de bundle: indirecte bibliotheken (via @ledgerhq/ledger-bitcoin) bevatten zulke
// functies wel, maar we roepen ze niet aan. Zie ADR-0015 "Wat dit niet oplost".

/** Herstelzin- en hot-wallet-bibliotheken: ook niet indirect in de web-bundle. */
export const HOT_WALLET_LIBS = ["bip39", "@scure/bip39", "ethers", "web3", "viem", "@solana/web3.js", "@trustwallet/wallet-core"];
/** Mag niet als eigen dependency. ecpair en wif komen indirect mee met @ledgerhq/ledger-bitcoin (bitcoinjs-lib-hulpjes). */
export const NO_DIRECT_LIBS = [...HOT_WALLET_LIBS, "ecpair", "wif", "bitcoinjs-lib"];

/** API's die privésleutels maken, omzetten of daarmee in software ondertekenen, en letterlijke xprv/tprv-sleutels. */
/** API's die privésleutels maken, omzetten of daarmee in software ondertekenen, en letterlijke xprv/tprv-sleutels.
 * `.sign(` is in eigen code helemaal verboden (ook `tx.sign(pk)` van btc-signer); ondertekenen op het apparaat heet
 * `signOnDevice`/`signPsbt`. Bewust grof: een vals alarm kost een hernoeming, een gemiste overtreding kost geld. */
export const PRIVATE_KEY_APIS =
  /\b(fromMasterSeed|mnemonicToSeed\w*|generateMnemonic|entropyToMnemonic|randomPrivateKey\w*|randomSecretKey|privateExtendedKey|privateKey|signIdx|signAllInputs|ECPair\w*|BIP32Factory|WIF|toWIF|fromWIF|getPublicKey|makeRandom|fromSeed)\b|(?<!Math)\.sign\s*\(|\b[xt]prv[1-9A-HJ-NP-Za-km-z]{20,}|["'`]private["'`]\s*\+/;

/** Commentaar telt niet mee: uitleg over WIF of privésleutels is geen gebruik. Naïef, maar voldoende voor onze code. */
export const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

export const usesPrivateKeyApi = (code) => PRIVATE_KEY_APIS.test(stripComments(code));
