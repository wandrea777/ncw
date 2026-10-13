/**
 * Herkent invoer die op een herstelzin of privésleutel lijkt, zodat de app waarschuwt in plaats van die
 * als adres te behandelen. De invoer wordt nergens heen gestuurd of bewaard.
 */
export function looksLikeSecret(input: string): boolean {
  const s = input.trim();
  // BIP-39-achtig, in elke taal: 12–24 woorden van letters, gescheiden door spaties, komma's, regeleinden of nummers.
  const words = s
    .toLowerCase()
    .split(/[\s,;]+/)
    .map((w) => w.replace(/^\d+[.)]?/, ""))
    .filter(Boolean);
  if (words.length >= 12 && words.length <= 24 && words.every((w) => /^\p{L}{1,12}$/u.test(w))) return true;
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(s)) return true; // ruwe privésleutel (32 bytes hex)
  if (/[0-9a-fA-F]{64}/.test(s) && !/^0x[0-9a-fA-F]{40}$/.test(s)) return true; // sleutel ergens in de invoer
  if (/^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(s)) return true; // Bitcoin WIF
  if (/^[xyztuvYZUV]prv[1-9A-HJ-NP-Za-km-z]{100,}$/.test(s)) return true; // uitgebreide privésleutel (BIP-32/49/84, testnet)
  return false;
}
