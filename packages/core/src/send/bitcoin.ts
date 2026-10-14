/**
 * Bitcoin versturen met een hardware wallet: alleen het bouwen, controleren en afronden van een transactie.
 * Hier staat géén code die sleutels maakt, bewaart of ermee ondertekent; ondertekenen gebeurt op het apparaat
 * (ADR-0012, ADR-0015). Alles is vastgezet op testnet: een mainnet-adres of -sleutel wordt geweigerd.
 */
import { HDKey } from "@scure/bip32";
import { Address, NETWORK, OutScript, TEST_NETWORK, Transaction, p2wpkh, selectUTXO } from "@scure/btc-signer";
import { base64, hex } from "@scure/base";
import type { FetchLike } from "../prices/binance";
import { sleep, withRetry } from "../http";

export const BTC_TESTNET = {
  name: "testnet4",
  api: "https://mempool.space/testnet4/api",
  explorer: "https://mempool.space/testnet4",
} as const;

/** BIP-84, coin type 1 (alle testnetten), account 0. */
export const ACCOUNT_PATH = "m/84'/1'/0'";
const H = 0x80000000;
const ACCOUNT_PATH_NUMS = [84 + H, 1 + H, 0 + H];
/** Versiebytes van `tpub`/`tprv` (BIP-32, testnet). */
const TESTNET_VERSIONS = { private: 0x04358394, public: 0x043587cf };
export const GAP_LIMIT = 20;
/** Vergoedingen boven deze grens weigeren we: dat is vrijwel altijd een fout of een aanval. */
export const MAX_FEE_RATE = 1000n;
/** Kleinste bedrag dat we naar één uitvoer sturen (dust-grens voor P2TR/P2WSH, de hoogste van SegWit). */
export const MIN_SEND_SATS = 546n;

export class SendError extends Error {
  constructor(readonly code: SendErrorCode, message: string) {
    super(message);
  }
}
export type SendErrorCode =
  | "address-empty"
  | "address-mainnet"
  | "address-invalid"
  | "amount-invalid"
  | "amount-too-small"
  | "insufficient-funds"
  | "fee-invalid"
  | "account-invalid"
  | "plan-mismatch"
  | "utxo-mismatch"
  | "signature-mismatch"
  | "network";

export interface LedgerAccount {
  /** Master fingerprint, 8 hex-tekens. */
  fingerprint: string;
  /** Extended public key op `ACCOUNT_PATH` (`tpub…`). */
  xpub: string;
}

export interface DerivedAddress {
  address: string;
  change: 0 | 1;
  index: number;
  pubkey: Uint8Array;
  script: Uint8Array;
}

/** Controleert het account dat de Ledger teruggeeft en geeft een functie die adressen afleidt (alleen publieke sleutels). */
export function accountDeriver(account: LedgerAccount): (change: 0 | 1, index: number) => DerivedAddress {
  if (!/^[0-9a-f]{8}$/.test(account.fingerprint)) throw new SendError("account-invalid", "Ongeldige fingerprint van de hardware wallet.");
  if (!account.xpub.startsWith("tpub")) throw new SendError("account-invalid", "Geen testnet-sleutel (tpub) van de hardware wallet.");
  let root: HDKey;
  try {
    root = HDKey.fromExtendedKey(account.xpub, TESTNET_VERSIONS);
  } catch {
    throw new SendError("account-invalid", "De extended public key van de hardware wallet is ongeldig.");
  }
  // Alleen `tpub` komt hier (zie boven), dus geen privésleutel; de diepte moet die van het account zijn.
  if (root.depth !== 3) throw new SendError("account-invalid", "Onverwachte sleutel van de hardware wallet.");
  const branches = [root.deriveChild(0), root.deriveChild(1)] as const;
  return (change, index) => {
    if (!Number.isInteger(index) || index < 0 || index >= H) throw new SendError("account-invalid", "Ongeldige adresindex.");
    const pubkey = branches[change].deriveChild(index).publicKey!;
    const pay = p2wpkh(pubkey, TEST_NETWORK);
    return { address: pay.address!, change, index, pubkey, script: pay.script };
  };
}

/** Pad als getallen (voor PSBT `bip32Derivation`). */
export function derivationPath(change: 0 | 1, index: number): number[] {
  return [...ACCOUNT_PATH_NUMS, change, index];
}

/** Valideert een ontvangstadres: alleen testnet, met checksum. Geeft het genormaliseerde adres terug. */
export function parseRecipient(raw: string): string {
  const input = raw.trim();
  if (!input) throw new SendError("address-empty", "Vul een adres in.");
  // Bech32 mag geheel in hoofdletters (QR-codes), nooit gemengd.
  const lower = input.toLowerCase();
  const candidate = /^(tb1|bc1)/.test(lower) && (input === lower || input === input.toUpperCase()) ? lower : input;
  if (isValidFor(candidate, TEST_NETWORK)) return candidate;
  if (isValidFor(candidate, NETWORK)) throw new SendError("address-mainnet", "Dit is een mainnet-adres. KERN verstuurt alleen op testnet.");
  throw new SendError("address-invalid", "Ongeldig testnet-adres. Controleer het op typfouten.");
}

function isValidFor(address: string, network: typeof NETWORK): boolean {
  try {
    Address(network).decode(address);
    return true;
  } catch {
    return false;
  }
}

/** "0.001" of "0,001" → satoshi. Maximaal 8 decimalen, geen duizendtalscheiding. */
export function parseBtcAmount(raw: string): bigint {
  const input = raw.trim();
  const m = /^(\d{1,8})(?:[.,](\d{1,8}))?$/.exec(input);
  if (!m) throw new SendError("amount-invalid", "Ongeldig bedrag. Gebruik bijvoorbeeld 0,001 (maximaal 8 decimalen).");
  const sats = BigInt(m[1]!) * 100_000_000n + BigInt((m[2] ?? "").padEnd(8, "0"));
  if (sats < MIN_SEND_SATS) throw new SendError("amount-too-small", `Het minimum is ${MIN_SEND_SATS} sat.`);
  return sats;
}

export function formatBtc(sats: bigint): string {
  const neg = sats < 0n;
  const abs = neg ? -sats : sats;
  const frac = (abs % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${abs / 100_000_000n}${frac ? `.${frac}` : ""}`;
}

/**
 * Address poisoning: een aanvaller stuurt stof vanaf een adres dat aan begin en eind op een bekend adres lijkt.
 * Twee verschillende adressen met dezelfde 4 tekens na het type-voorvoegsel én dezelfde laatste 4 tekens lijken op elkaar.
 */
export function looksLike(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/^(tb1|bc1)[a-z0-9]?/, "");
  const [x, y] = [norm(a), norm(b)];
  if (a.toLowerCase() === b.toLowerCase() || x.length < 8 || y.length < 8) return false;
  return x.slice(0, 4) === y.slice(0, 4) && x.slice(-4) === y.slice(-4);
}

// ------------------------------------------------------------------ account scannen (mempool.space, testnet4)

export interface Utxo {
  txid: string;
  vout: number;
  value: bigint;
  confirmed: boolean;
  owner: DerivedAddress;
}

export interface AccountState {
  utxos: Utxo[];
  /** Bevestigd saldo (alleen deze UTXO's gebruiken we). */
  confirmed: bigint;
  /** Nog onbevestigd, niet bruikbaar tot bevestiging. */
  pending: bigint;
  nextReceive: DerivedAddress;
  nextChange: DerivedAddress;
  /** Alle gebruikte adressen, voor de waarschuwing tegen lijkende adressen. */
  used: DerivedAddress[];
}

interface MempoolAddressInfo {
  chain_stats: { tx_count: number };
  mempool_stats: { tx_count: number };
}
interface MempoolUtxo {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean };
}

async function getJson<T>(fetchFn: FetchLike, url: string): Promise<T> {
  const res = await fetchFn(url);
  if (!res.ok) throw new SendError("network", `Testnet-gegevens ophalen mislukt (${res.status}).`);
  return (await res.json()) as T;
}

/** Zoekt gebruikte adressen en UTXO's tot `GAP_LIMIT` ongebruikte adressen op rij (BIP-44). */
export async function scanAccount(
  derive: (change: 0 | 1, index: number) => DerivedAddress,
  opts: { fetch?: FetchLike; gap?: number; delayMs?: number; onProgress?: (checked: number) => void } = {},
): Promise<AccountState> {
  const fetchFn = withRetry(opts.fetch ?? fetch);
  const gap = opts.gap ?? GAP_LIMIT;
  const delay = opts.delayMs ?? 100;
  const utxos: Utxo[] = [];
  const used: DerivedAddress[] = [];
  const next: DerivedAddress[] = [];
  let checked = 0;
  for (const change of [0, 1] as const) {
    let firstUnused: DerivedAddress | null = null;
    for (let index = 0, unusedInRow = 0; unusedInRow < gap; index++) {
      const a = derive(change, index);
      if (checked > 0 && delay) await sleep(delay);
      const info = await getJson<MempoolAddressInfo>(fetchFn, `${BTC_TESTNET.api}/address/${a.address}`);
      opts.onProgress?.(++checked);
      if (info.chain_stats.tx_count + info.mempool_stats.tx_count === 0) {
        unusedInRow++;
        firstUnused ??= a;
        continue;
      }
      unusedInRow = 0;
      firstUnused = null;
      used.push(a);
      for (const u of await getJson<MempoolUtxo[]>(fetchFn, `${BTC_TESTNET.api}/address/${a.address}/utxo`)) {
        utxos.push({ txid: u.txid, vout: u.vout, value: BigInt(u.value), confirmed: u.status.confirmed, owner: a });
      }
    }
    next.push(firstUnused!);
  }
  const sum = (xs: Utxo[]) => xs.reduce((s, u) => s + u.value, 0n);
  return {
    utxos,
    confirmed: sum(utxos.filter((u) => u.confirmed)),
    pending: sum(utxos.filter((u) => !u.confirmed)),
    nextReceive: next[0]!,
    nextChange: next[1]!,
    used,
  };
}

export interface FeeRates {
  fast: bigint;
  normal: bigint;
  slow: bigint;
}

export async function fetchFeeRates(rawFetch: FetchLike = fetch): Promise<FeeRates> {
  const r = await getJson<{ fastestFee: number; halfHourFee: number; hourFee: number }>(withRetry(rawFetch), `${BTC_TESTNET.api}/v1/fees/recommended`);
  const clamp = (n: number) => {
    const v = BigInt(Math.max(1, Math.ceil(n)));
    return v > MAX_FEE_RATE ? MAX_FEE_RATE : v;
  };
  return { fast: clamp(r.fastestFee), normal: clamp(r.halfHourFee), slow: clamp(r.hourFee) };
}

// ------------------------------------------------------------------ transactie bouwen en controleren

export interface SendRequest {
  account: LedgerAccount;
  state: AccountState;
  recipient: string;
  amount: bigint;
  feeRate: bigint;
}

export interface SendPlan {
  /** PSBT v0 in base64, klaar voor de Ledger. */
  psbt: string;
  recipient: string;
  amount: bigint;
  fee: bigint;
  change: bigint;
  vsize: number;
  /** De UTXO's die worden uitgegeven; voor elk is de volledige vorige transactie nodig. */
  inputs: Utxo[];
}

/**
 * Kiest UTXO's en bouwt een ongetekende transactie (stap 1). De Ledger eist bij SegWit v0 ook de volledige
 * vorige transacties; die voeg je toe met `attachPrevTxs` (stap 2).
 */
export function planSend(req: SendRequest): Omit<SendPlan, "psbt"> & { tx: Transaction } {
  const recipient = parseRecipient(req.recipient);
  if (req.amount < MIN_SEND_SATS) throw new SendError("amount-too-small", `Het minimum is ${MIN_SEND_SATS} sat.`);
  if (req.feeRate < 1n || req.feeRate > MAX_FEE_RATE) throw new SendError("fee-invalid", `De vergoeding moet tussen 1 en ${MAX_FEE_RATE} sat/vB liggen.`);
  const fpr = Number.parseInt(req.account.fingerprint, 16);
  const spendable = req.state.utxos.filter((u) => u.confirmed);
  const candidates = spendable.map((u) => ({
    txid: hex.decode(u.txid),
    index: u.vout,
    witnessUtxo: { script: u.owner.script, amount: u.value },
    bip32Derivation: [[u.owner.pubkey, { fingerprint: fpr, path: derivationPath(u.owner.change, u.owner.index) }]] as [Uint8Array, { fingerprint: number; path: number[] }][],
  }));
  const change = req.state.nextChange;
  const sel = selectUTXO(candidates, [{ address: recipient, amount: req.amount }], "default", {
    feePerByte: req.feeRate,
    changeAddress: change.address,
    network: TEST_NETWORK,
    createTx: true,
    bip69: true,
  });
  if (!sel?.tx) throw new SendError("insufficient-funds", "Onvoldoende bevestigd saldo voor dit bedrag plus de netwerkvergoeding.");
  const tx = sel.tx;
  for (let i = 0; i < tx.outputsLength; i++) {
    const out = tx.getOutput(i);
    if (out.script && equalBytes(out.script, change.script)) {
      tx.updateOutput(i, { bip32Derivation: [[change.pubkey, { fingerprint: fpr, path: derivationPath(1, change.index) }]] });
    }
  }
  const inputs: Utxo[] = [];
  for (let i = 0; i < tx.inputsLength; i++) {
    const inp = tx.getInput(i);
    const u = spendable.find((x) => x.txid === hex.encode(inp.txid!) && x.vout === inp.index);
    if (!u) throw new SendError("plan-mismatch", "De gekozen invoer hoort niet bij dit account.");
    inputs.push(u);
  }
  const summary = verifyPlan(tx, { recipient, amount: req.amount, changeScript: change.script, feeRate: req.feeRate });
  return { tx, recipient, amount: req.amount, fee: summary.fee, change: summary.change, vsize: summary.vsize, inputs };
}

/**
 * Onafhankelijke controle van wat we de Ledger laten ondertekenen: precies één uitvoer naar de ontvanger met het
 * gevraagde bedrag, hooguit één uitvoer naar ons eigen wisselgeldadres, en een vergoeding binnen de grenzen.
 */
export function verifyPlan(tx: Transaction, want: { recipient: string; amount: bigint; changeScript: Uint8Array; feeRate: bigint }) {
  const recipientScript = OutScript.encode(Address(TEST_NETWORK).decode(want.recipient));
  let toRecipient = 0n;
  let recipientOutputs = 0;
  let change = 0n;
  let changeOutputs = 0;
  let totalOut = 0n;
  for (let i = 0; i < tx.outputsLength; i++) {
    const o = tx.getOutput(i);
    if (!o.script || o.amount === undefined) throw new SendError("plan-mismatch", "Onvolledige uitvoer.");
    totalOut += o.amount;
    if (equalBytes(o.script, recipientScript)) (toRecipient += o.amount), recipientOutputs++;
    else if (equalBytes(o.script, want.changeScript)) (change += o.amount), changeOutputs++;
    else throw new SendError("plan-mismatch", "De transactie bevat een onbekende uitvoer.");
  }
  if (recipientOutputs !== 1 || toRecipient !== want.amount) throw new SendError("plan-mismatch", "Het bedrag naar de ontvanger klopt niet.");
  if (changeOutputs > 1) throw new SendError("plan-mismatch", "Meer dan één wisselgelduitvoer.");
  let totalIn = 0n;
  for (let i = 0; i < tx.inputsLength; i++) {
    const amt = tx.getInput(i).witnessUtxo?.amount;
    if (amt === undefined) throw new SendError("plan-mismatch", "Invoer zonder bedrag.");
    totalIn += amt;
  }
  const fee = totalIn - totalOut;
  const vsize = estimateVsize(tx.inputsLength, tx.outputsLength);
  // Bovengrens: elke invoer P2WPKH en elke uitvoer zo groot als P2TR/P2WSH. Valt het wisselgeld onder de dust-grens,
  // dan gaat het naar de vergoeding; de marge van 2000 sat vangt dat op.
  if (fee <= 0n || fee > BigInt(vsize) * want.feeRate + 2000n) {
    throw new SendError("plan-mismatch", "De netwerkvergoeding is onverwacht hoog.");
  }
  return { fee, change, vsize };
}

/** Voegt de volledige vorige transacties toe en controleert dat ze bij de invoer horen (txid én bedrag). */
export function attachPrevTxs(plan: ReturnType<typeof planSend>, rawTxs: Map<string, string>): SendPlan {
  const { tx, ...rest } = plan;
  for (let i = 0; i < tx.inputsLength; i++) {
    const inp = tx.getInput(i);
    const txid = hex.encode(inp.txid!);
    const raw = rawTxs.get(txid);
    if (!raw) throw new SendError("utxo-mismatch", "Vorige transactie ontbreekt.");
    let prev: Transaction;
    try {
      prev = Transaction.fromRaw(hex.decode(raw), { allowUnknownOutputs: true, disableScriptCheck: true });
    } catch {
      throw new SendError("utxo-mismatch", "Vorige transactie is ongeldig.");
    }
    if (prev.id !== txid) throw new SendError("utxo-mismatch", "Vorige transactie hoort niet bij deze invoer.");
    const out = prev.getOutput(inp.index!);
    if (out.amount !== inp.witnessUtxo?.amount || !out.script || !equalBytes(out.script, inp.witnessUtxo!.script)) {
      throw new SendError("utxo-mismatch", "Bedrag of script van de invoer klopt niet met de vorige transactie.");
    }
    tx.updateInput(i, { nonWitnessUtxo: hex.decode(raw) });
  }
  return { ...rest, psbt: base64.encode(tx.toPSBT(0)) };
}

/** Haalt de ruwe vorige transacties op bij mempool.space. */
export async function fetchPrevTxs(inputs: Utxo[], rawFetch: (url: string) => Promise<Response> = fetch): Promise<Map<string, string>> {
  const fetchFn = withRetry(rawFetch);
  const out = new Map<string, string>();
  for (const txid of new Set(inputs.map((u) => u.txid))) {
    const res = await fetchFn(`${BTC_TESTNET.api}/tx/${txid}/hex`);
    if (!res.ok) throw new SendError("network", `Vorige transactie ophalen mislukt (${res.status}).`);
    out.set(txid, (await res.text()).trim());
  }
  return out;
}

export interface DeviceSignature {
  inputIndex: number;
  pubkey: Uint8Array;
  signature: Uint8Array;
}

/**
 * Zet de handtekeningen van het apparaat in de PSBT en maakt de transactie af. Elke invoer moet precies één
 * handtekening krijgen, van de sleutel die we in `bip32Derivation` noemden.
 */
export function finalizeSigned(psbt: string, sigs: DeviceSignature[]): { hex: string; txid: string } {
  const tx = Transaction.fromPSBT(base64.decode(psbt));
  if (sigs.length !== tx.inputsLength) throw new SendError("signature-mismatch", "Niet elke invoer is ondertekend.");
  const seen = new Set<number>();
  for (const s of sigs) {
    if (seen.has(s.inputIndex) || s.inputIndex < 0 || s.inputIndex >= tx.inputsLength) throw new SendError("signature-mismatch", "Onverwachte handtekening.");
    seen.add(s.inputIndex);
    const expected = tx.getInput(s.inputIndex).bip32Derivation?.[0]?.[0];
    if (!expected || !equalBytes(expected, s.pubkey)) throw new SendError("signature-mismatch", "Handtekening van een onverwachte sleutel.");
    tx.updateInput(s.inputIndex, { partialSig: [[s.pubkey, s.signature]] });
  }
  tx.finalize();
  return { hex: tx.hex, txid: tx.id };
}

/** Zendt de transactie uit via mempool.space (rechtstreeks vanuit de browser; de KERN-server ziet hem nooit). */
export async function broadcast(signed: { hex: string; txid: string }, rawFetch: typeof fetch = fetch): Promise<string> {
  const res = await rawFetch(`${BTC_TESTNET.api}/tx`, { method: "POST", body: signed.hex, headers: { "content-type": "text/plain" } });
  const body = (await res.text()).trim();
  if (!res.ok) throw new SendError("network", `Uitzenden geweigerd door het netwerk: ${body.slice(0, 200)}`);
  if (body !== signed.txid) throw new SendError("network", "Het netwerk gaf een ander transactie-ID terug.");
  return body;
}

/** Bovengrens van de virtuele grootte voor P2WPKH-invoer (68 vB) en uitvoer tot 43 vB (P2TR/P2WSH). */
export function estimateVsize(inputs: number, outputs: number): number {
  return 11 + 68 * inputs + 43 * outputs;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
