/**
 * Verbinding met een Ledger via WebHID, alleen voor de app "Bitcoin Test" (ADR-0015). De sleutel verlaat het
 * apparaat nooit: deze module vraagt alleen de master fingerprint, de extended public key van het account,
 * een adres ter controle op het scherm, en handtekeningen die de gebruiker op het apparaat goedkeurt.
 * Niets hiervan wordt opgeslagen of naar de KERN-server gestuurd.
 */
import { ACCOUNT_PATH, type DeviceSignature, type LedgerAccount } from "@ncw/core/send/bitcoin";

export type LedgerErrorCode = "unsupported" | "cancelled" | "locked" | "busy" | "wrong-app" | "mainnet-app" | "old-app" | "rejected" | "disconnected" | "unknown";

export class LedgerError extends Error {
  constructor(readonly code: LedgerErrorCode) {
    super(code);
  }
}

/** Minimale versie van de Bitcoin-app met het PSBT-protocol (wallet policies). */
const MIN_APP_VERSION = [2, 1, 0] as const;

export interface LedgerSession {
  account: LedgerAccount;
  /** Laat een eigen ontvangstadres zien op het scherm van het apparaat. Geeft het adres terug zoals het apparaat het berekende. */
  showAddress(change: 0 | 1, index: number): Promise<string>;
  /** Vraagt het adres zonder het te tonen (om de eigen afleiding te controleren). */
  address(change: 0 | 1, index: number): Promise<string>;
  /** Ondertekenen gebeurt op het apparaat, na bevestiging op het scherm. */
  signOnDevice(psbtBase64: string): Promise<DeviceSignature[]>;
  close(): Promise<void>;
}

export function webHidSupported(): boolean {
  return typeof navigator !== "undefined" && "hid" in navigator;
}

let modules: Promise<{
  TransportWebHID: typeof import("@ledgerhq/hw-transport-webhid").default;
  ledger: typeof import("@ledgerhq/ledger-bitcoin");
}> | null = null;

/** Laadt de Ledger-code alvast (bij het openen van de dialoog), zodat de klik op "Verbind" de gebruikersactie behoudt. */
export function preloadLedger() {
  modules ??= (async () => {
    await import("./bufferPolyfill");
    const [t, ledger] = await Promise.all([import("@ledgerhq/hw-transport-webhid"), import("@ledgerhq/ledger-bitcoin")]);
    return { TransportWebHID: t.default, ledger };
  })();
  return modules;
}

export function versionAtLeast(version: string, min: readonly number[]): boolean {
  const parts = version.split(/[.-]/).map((p) => Number.parseInt(p, 10));
  for (let i = 0; i < min.length; i++) {
    const v = Number.isFinite(parts[i]) ? parts[i]! : 0;
    if (v !== min[i]) return v > min[i]!;
  }
  return true;
}

/** Vertaalt fouten van de transport- en app-laag naar een vaste set codes (geen ruwe foutteksten in de UI). */
export function toLedgerError(e: unknown): LedgerError {
  if (e instanceof LedgerError) return e;
  const err = e as { name?: string; statusCode?: number; message?: string };
  if (err?.name === "TransportOpenUserCancelled" || err?.name === "NotFoundError") return new LedgerError("cancelled");
  if (err?.name === "DisconnectedDevice" || err?.name === "DisconnectedDeviceDuringOperation") return new LedgerError("disconnected");
  // Al in gebruik: een tweede verzoek terwijl het apparaat nog bezig is, of Ledger Live houdt de verbinding vast.
  if (err?.name === "TransportRaceCondition" || err?.name === "InvalidStateError" || err?.name === "NotAllowedError") return new LedgerError("busy");
  switch (err?.statusCode) {
    case 0x6985:
      return new LedgerError("rejected");
    case 0x5515:
    case 0x6982: // vergrendeld op oudere firmware
      return new LedgerError("locked");
    case 0x6e00:
    case 0x6e01:
    case 0x6d00:
    case 0x6511:
    case 0x6a82:
      return new LedgerError("wrong-app");
  }
  return new LedgerError("unknown");
}

/** Het deel van de Ledger-client dat we gebruiken (zo te testen met een nep-apparaat). */
export interface AppLike<P> {
  getAppAndVersion(): Promise<{ name: string; version: string }>;
  getMasterFingerprint(): Promise<string>;
  getExtendedPubkey(path: string, display?: boolean): Promise<string>;
  getWalletAddress(policy: P, hmac: null, change: number, index: number, display: boolean): Promise<string>;
  signPsbt(psbt: string, policy: P, hmac: null): Promise<Array<[number, { pubkey: Uint8Array; signature: Uint8Array }]>>;
}

/**
 * Controleert de geopende app en bouwt de sessie. Alleen "Bitcoin Test" (testnet, MICA-4); de mainnet-app "Bitcoin"
 * krijgt een eigen melding, omdat dat de gevaarlijke vergissing is.
 */
export async function openSession<P>(app: AppLike<P>, makePolicy: (template: "wpkh(@0/**)", key: string) => P, close: () => Promise<unknown>): Promise<LedgerSession> {
  const { name, version } = await app.getAppAndVersion();
  if (name === "Bitcoin") throw new LedgerError("mainnet-app");
  if (name !== "Bitcoin Test") throw new LedgerError("wrong-app");
  if (!versionAtLeast(version, MIN_APP_VERSION)) throw new LedgerError("old-app");
  const fingerprint = await app.getMasterFingerprint();
  const xpub = await app.getExtendedPubkey(ACCOUNT_PATH, false);
  const policy = makePolicy("wpkh(@0/**)", `[${fingerprint}${ACCOUNT_PATH.slice(1)}]${xpub}`);
  const wrap = async <T>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (e) {
      throw toLedgerError(e);
    }
  };
  return {
    account: { fingerprint, xpub },
    showAddress: (change, index) => wrap(() => app.getWalletAddress(policy, null, change, index, true)),
    address: (change, index) => wrap(() => app.getWalletAddress(policy, null, change, index, false)),
    signOnDevice: (psbt) =>
      wrap(async () =>
        (await app.signPsbt(psbt, policy, null)).map(([inputIndex, s]) => ({
          inputIndex,
          pubkey: new Uint8Array(s.pubkey),
          signature: new Uint8Array(s.signature),
        })),
      ),
    close: () => close().then(() => undefined, () => undefined),
  };
}

/** USB-vendor-ID van Ledger; de browser toont alleen deze apparaten in de kiezer. */
export const LEDGER_VENDOR_ID = 0x2c97;

interface HidDeviceLike {
  vendorId: number;
}
export interface HidLike {
  getDevices(): Promise<HidDeviceLike[]>;
  requestDevice(opts: { filters: Array<{ vendorId: number }> }): Promise<HidDeviceLike[]>;
}

/** Een eerder toegestane Ledger, anders de kiezer van de browser. `null` als de gebruiker niets kiest. */
export async function pickLedger(hid: HidLike): Promise<HidDeviceLike | null> {
  const known = (await hid.getDevices()).find((d) => d.vendorId === LEDGER_VENDOR_ID);
  if (known) return known;
  const picked = await hid.requestDevice({ filters: [{ vendorId: LEDGER_VENDOR_ID }] });
  return picked.find((d) => d.vendorId === LEDGER_VENDOR_ID) ?? null;
}

export async function connectLedger(): Promise<LedgerSession> {
  if (!webHidSupported()) throw new LedgerError("unsupported");
  const { TransportWebHID, ledger } = await preloadLedger();
  let transport: Awaited<ReturnType<typeof TransportWebHID.open>>;
  try {
    // Zelf kiezen in plaats van TransportWebHID.request(): bij annuleren geeft Chrome een lege lijst, en dan opent
    // de bibliotheek `undefined` (TypeError) in plaats van een nette "geannuleerd".
    const device = await pickLedger((navigator as unknown as { hid: HidLike }).hid);
    if (!device) throw new LedgerError("cancelled");
    transport = await TransportWebHID.open(device as Parameters<typeof TransportWebHID.open>[0]);
  } catch (e) {
    throw toLedgerError(e);
  }
  try {
    return await openSession(new ledger.AppClient(transport), (template, key) => new ledger.DefaultWalletPolicy(template, key), () => transport.close());
  } catch (e) {
    await transport.close().catch(() => undefined);
    throw toLedgerError(e);
  }
}
