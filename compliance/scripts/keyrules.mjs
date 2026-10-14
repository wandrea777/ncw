// Regels voor control MICA-1 (ADR-0012, ADR-0015): de browsercode maakt, bewaart of gebruikt nooit privésleutels.

/** Herstelzin- en hot-wallet-bibliotheken: ook niet indirect in de web-bundle. */
export const HOT_WALLET_LIBS = ["bip39", "@scure/bip39", "ethers", "web3", "viem", "@solana/web3.js", "@trustwallet/wallet-core"];
/** Mag niet als eigen dependency. ecpair en wif komen indirect mee met @ledgerhq/ledger-bitcoin (bitcoinjs-lib-hulpjes). */
export const NO_DIRECT_LIBS = [...HOT_WALLET_LIBS, "ecpair", "wif", "bitcoinjs-lib"];

/** API's die privésleutels maken, omzetten of daarmee in software ondertekenen, en letterlijke xprv/tprv-sleutels. */
export const PRIVATE_KEY_APIS =
  /\b(fromMasterSeed|mnemonicToSeed\w*|generateMnemonic|entropyToMnemonic|randomPrivateKey\w*|randomSecretKey|privateExtendedKey|privateKey|signIdx|signAllInputs|ECPair|WIF|toWIF|fromWIF)\b|\b(secp256k1|schnorr)\.sign\b|\b[xt]prv[1-9A-HJ-NP-Za-km-z]{20,}/;

/** Commentaar telt niet mee: uitleg over WIF of privésleutels is geen gebruik. Naïef, maar voldoende voor onze code. */
export const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

export const usesPrivateKeyApi = (code) => PRIVATE_KEY_APIS.test(stripComments(code));
