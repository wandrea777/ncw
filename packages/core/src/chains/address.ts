import { bech32, bech32m, createBase58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export type Chain = "bitcoin" | "ethereum";

export type AddressCheck =
  | { ok: true; chain: Chain; normalized: string }
  | { ok: false; reason: string };

const base58check = createBase58check(sha256);

function checkBitcoin(input: string): AddressCheck | null {
  const lower = input.toLowerCase();
  if (lower.startsWith("bc1")) {
    if (input !== lower && input !== input.toUpperCase()) {
      return { ok: false, reason: "Bech32-adres met gemengde hoofdletters is ongeldig." };
    }
    try {
      const decoded = bech32.decode(lower as `${string}1${string}`);
      if (decoded.prefix === "bc" && decoded.words[0] === 0) return { ok: true, chain: "bitcoin", normalized: lower };
    } catch {
      /* probeer bech32m */
    }
    try {
      const decoded = bech32m.decode(lower as `${string}1${string}`);
      if (decoded.prefix === "bc" && (decoded.words[0] ?? 0) >= 1) {
        return { ok: true, chain: "bitcoin", normalized: lower };
      }
    } catch {
      /* ongeldig */
    }
    return { ok: false, reason: "Ongeldige checksum voor Bitcoin bech32-adres." };
  }
  if (/^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(input)) {
    try {
      const payload = base58check.decode(input);
      const version = payload[0];
      if (payload.length === 21 && (version === 0x00 || version === 0x05)) {
        return { ok: true, chain: "bitcoin", normalized: input };
      }
    } catch {
      /* ongeldig */
    }
    return { ok: false, reason: "Ongeldige checksum voor Bitcoin-adres." };
  }
  return null;
}

/** EIP-55 checksum. Adressen in alleen kleine of alleen hoofdletters worden geaccepteerd. */
function checkEthereum(input: string): AddressCheck | null {
  if (!/^0x[0-9a-fA-F]{40}$/.test(input)) return null;
  const body = input.slice(2);
  const hash = bytesToHex(keccak_256(utf8ToBytes(body.toLowerCase())));
  const checksummed =
    "0x" +
    [...body.toLowerCase()]
      .map((c, i) => (parseInt(hash[i] ?? "0", 16) >= 8 ? c.toUpperCase() : c))
      .join("");
  const isUniformCase = body === body.toLowerCase() || body === body.toUpperCase();
  if (!isUniformCase && input !== checksummed) {
    return { ok: false, reason: "EIP-55-checksum klopt niet. Controleer het adres op typfouten." };
  }
  return { ok: true, chain: "ethereum", normalized: checksummed };
}

export function checkAddress(raw: string): AddressCheck {
  const input = raw.trim();
  if (!input) return { ok: false, reason: "Leeg adres." };
  return (
    checkBitcoin(input) ??
    checkEthereum(input) ?? { ok: false, reason: "Onbekend adresformaat. Ondersteund: Bitcoin en Ethereum." }
  );
}
