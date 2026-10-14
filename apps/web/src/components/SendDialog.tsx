import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, Usb } from "lucide-react";
import {
  BTC_TESTNET,
  SendError,
  accountDeriver,
  attachPrevTxs,
  broadcast,
  fetchFeeRates,
  fetchPrevTxs,
  finalizeSigned,
  formatBtc,
  looksLike,
  parseBtcAmount,
  parseRecipient,
  planSend,
  scanAccount,
  type AccountState,
  type FeeRates,
  type SendPlan,
} from "@ncw/core/send/bitcoin";
import { Dialog } from "./Dialog";
import { useI18n, type Key } from "../i18n";
import { LedgerError, connectLedger, preloadLedger, webHidSupported, type LedgerSession } from "../lib/ledger";
import type { WatchedAddress } from "../lib/storage";

type Phase =
  | { k: "intro" }
  | { k: "connecting" }
  | { k: "scanning"; checked: number }
  | { k: "form" }
  | { k: "review"; plan: SendPlan }
  | { k: "signing"; plan: SendPlan }
  | { k: "done"; txid: string }
  | { k: "error"; code: string; txid?: string };

type Speed = keyof FeeRates;

/**
 * Fouten waarna je niet verder mag met dezelfde verbinding: de eigen afleiding klopt niet met het apparaat (dan zou
 * wisselgeld naar een vreemd adres kunnen gaan), of we weten niet of de transactie al is uitgezonden.
 */
const FATAL = new Set(["account-invalid", "broadcast-uncertain"]);

/** Het volledige adres in blokjes van 4, precies zoals het in de transactie komt. */
function Chunked({ address }: { address: string }) {
  const parts = address.match(/.{1,4}/g) ?? [address];
  return <>{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <span key={i}>{p}</span>))}</>;
}

/**
 * Versturen met een Ledger, alleen op Bitcoin testnet4 (ADR-0012, ADR-0015). De browser bouwt de transactie,
 * het apparaat toont ontvanger, bedrag en vergoeding en ondertekent. KERN bewaart niets en de server ziet niets.
 */
export default function SendDialog({ watched, onClose }: { watched: WatchedAddress[]; onClose(): void }) {
  const { t, lang } = useI18n();
  const [phase, setPhase] = useState<Phase>({ k: "intro" });
  const session = useRef<LedgerSession | null>(null);
  const step = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<AccountState | null>(null);
  const [fees, setFees] = useState<FeeRates | null>(null);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [shown, setShown] = useState<null | "checking" | "ok">(null);
  const [busy, setBusy] = useState(false);
  // Synchroon (ref): state-updates zijn asynchroon, dus een snelle dubbelklik zou anders twee flows starten.
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const supported = webHidSupported();
  const btc = (sats: bigint) => (lang === "NL" ? formatBtc(sats).replace(".", ",") : formatBtc(sats));

  useEffect(() => {
    mounted.current = true;
    if (supported) void preloadLedger().catch(() => undefined);
    return () => {
      mounted.current = false;
      void session.current?.close();
    };
  }, [supported]);

  const begin = () => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  };
  const end = () => {
    busyRef.current = false;
    setBusy(false);
  };

  // Bij elke stapwissel verdwijnt de knop die de focus had; zet de focus op de nieuwe stap, zodat Tab in de dialoog blijft.
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) return void (firstStep.current = false);
    step.current?.focus();
  }, [phase.k]);

  async function forget() {
    const s = session.current;
    session.current = null;
    setState(null);
    setFees(null);
    setShown(null);
    await s?.close();
  }

  const fail = (e: unknown, txid?: string) => {
    const code = e instanceof LedgerError || e instanceof SendError ? e.code : "unknown";
    if (FATAL.has(code)) void forget();
    setPhase({ k: "error", code, txid });
  };

  async function connect() {
    if (!begin()) return;
    setPhase({ k: "connecting" });
    try {
      await forget();
      const s = await connectLedger();
      // Dialoog intussen gesloten: de verbinding direct weer sluiten in plaats van hem open te laten.
      if (!mounted.current) return void (await s.close());
      session.current = s;
      const derive = accountDeriver(s.account);
      // Eigen afleiding controleren tegen het apparaat: een fout hier zou wisselgeld naar een vreemd adres sturen.
      if ((await s.address(0, 0)) !== derive(0, 0).address) throw new SendError("account-invalid", "mismatch");
      setPhase({ k: "scanning", checked: 0 });
      const [st, fr] = await Promise.all([scanAccount(derive, { onProgress: (checked) => setPhase({ k: "scanning", checked }) }), fetchFeeRates()]);
      setState(st);
      setFees(fr);
      setPhase({ k: "form" });
    } catch (e) {
      fail(e);
    } finally {
      end();
    }
  }

  async function showOnDevice() {
    if (!session.current || !state) return;
    setShown("checking");
    try {
      const onDevice = await session.current.showAddress(0, state.nextReceive.index);
      if (onDevice !== state.nextReceive.address) throw new SendError("account-invalid", "mismatch");
      setShown("ok");
    } catch (e) {
      setShown(null);
      fail(e);
    }
  }

  const similar = useMemo(() => {
    let to: string;
    try {
      to = parseRecipient(recipient);
    } catch {
      return null;
    }
    const known = [...(state?.used.map((a) => a.address) ?? []), ...watched.map((w) => w.address)];
    return known.find((k) => looksLike(k, to)) ?? null;
  }, [recipient, state, watched]);

  function review() {
    if (!session.current || !state || !fees) return;
    setFormError(null);
    try {
      const sats = parseBtcAmount(amount);
      const plan = planSend({ account: session.current.account, state, recipient, amount: sats, feeRate: fees[speed] });
      setPhase({ k: "review", plan: { ...plan, psbt: "" } });
    } catch (e) {
      setFormError(e instanceof SendError ? e.code : "unknown");
    }
  }

  async function sign() {
    if (!session.current || !state || !fees || phase.k !== "review" || !begin()) return;
    let signed: { hex: string; txid: string } | null = null;
    try {
      // Opnieuw bouwen met dezelfde invoer, en controleren dat het precies het plan is dat de gebruiker zag.
      const plan = planSend({ account: session.current.account, state, recipient, amount: phase.plan.amount, feeRate: fees[speed] });
      const ready = attachPrevTxs(plan, await fetchPrevTxs(plan.inputs));
      if (ready.fee !== phase.plan.fee || ready.recipient !== phase.plan.recipient || ready.amount !== phase.plan.amount) {
        throw new SendError("plan-mismatch", "changed");
      }
      setPhase({ k: "signing", plan: ready });
      signed = finalizeSigned(ready.psbt, await session.current.signOnDevice(ready.psbt));
      setPhase({ k: "done", txid: await broadcast(signed) });
    } catch (e) {
      // Na ondertekenen is elke onverwachte fout tijdens uitzenden onzeker: de transactie kan al onderweg zijn.
      const uncertain = signed && !(e instanceof SendError && e.code === "broadcast-rejected");
      fail(uncertain ? new SendError("broadcast-uncertain", "uncertain") : e, signed?.txid);
    } finally {
      end();
    }
  }

  const errorText = (code: string) => {
    const key = `send.err.${code}` as Key;
    return t(key in ERROR_KEYS ? key : "send.err.unknown");
  };
  const fieldError = (prefix: string) => (formError?.startsWith(prefix) ? formError : null);
  const otherError = formError && !fieldError("address") && !fieldError("amount") ? formError : null;

  const live =
    phase.k === "connecting" ? t("send.connecting")
    : phase.k === "scanning" && phase.checked === 0 ? t("send.scanningStart")
    : phase.k === "form" ? t("send.ready")
    : phase.k === "signing" ? t("send.confirmOnDevice")
    : phase.k === "done" ? t("send.done")
    : "";

  return (
    <Dialog title={t("send.title")} onClose={onClose}>
      <p><span className="badge-line">{t("send.testnet")}</span></p>
      <p className="dialog-note">{t("send.testnetNote")}</p>
      {/* Eén vaste live region: schermlezers lezen alleen wijzigingen voor, niet elk nieuw element. */}
      <p className="sr-only" aria-live="polite">{live}</p>

      <div ref={step} tabIndex={-1} className="dialog-step" key={phase.k}>
        {phase.k === "intro" && (
          <>
            <p>{t("send.intro")}</p>
            {supported ? (
              <>
                <ol className="steps">
                  <li>{t("send.step1")}</li>
                  <li>{t("send.step2")}</li>
                  <li>{t("send.step3")}</li>
                </ol>
                <button className="primary-cta" onClick={connect} disabled={busy}>{t("send.connect")} <Usb size={17} /></button>
              </>
            ) : (
              <p className="dialog-note warn-note" role="alert">{t("send.unsupported")}</p>
            )}
          </>
        )}

        {phase.k === "connecting" && <p>{t("send.connecting")}</p>}
        {phase.k === "scanning" && <p>{t("send.scanning", { n: phase.checked })}</p>}

        {phase.k === "form" && state && fees && (
          <>
            <table className="kv">
              <tbody>
                <tr><th scope="row">{t("send.balance")}</th><td>{btc(state.confirmed)} tBTC</td></tr>
                {state.pending > 0n && <tr><th scope="row">{t("send.pending")}</th><td>{btc(state.pending)} tBTC</td></tr>}
              </tbody>
            </table>
            <details className="receive-own">
              <summary>{t("send.receiveOwn")}</summary>
              <div className="address-box chunked"><Chunked address={state.nextReceive.address} /></div>
              <button className="text-button" onClick={showOnDevice} disabled={shown === "checking"}>
                {shown === "ok" ? <><Check size={14} /> {t("send.shownOk")}</> : shown === "checking" ? t("send.confirmOnDevice") : t("send.showOnDevice")}
              </button>
            </details>
            <label className="field">
              <span>{t("send.to")}</span>
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="tb1q…"
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                aria-invalid={fieldError("address") ? true : undefined}
                aria-describedby={fieldError("address") ? "send-to-error" : similar ? "send-similar" : undefined}
              />
            </label>
            {fieldError("address") && <p className="form-error" id="send-to-error" role="alert">{errorText(fieldError("address")!)}</p>}
            {similar && <p className="dialog-note warn-note" id="send-similar" role="alert">{t("send.similar", { a: `${similar.slice(0, 8)}…${similar.slice(-6)}` })}</p>}
            <label className="field">
              <span>{t("send.amount")}</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={lang === "NL" ? "0,001" : "0.001"}
                aria-invalid={fieldError("amount") ? true : undefined}
                aria-describedby={fieldError("amount") ? "send-amount-error" : undefined}
              />
            </label>
            {fieldError("amount") && <p className="form-error" id="send-amount-error" role="alert">{errorText(fieldError("amount")!)}</p>}
            <div className="segmented" role="group" aria-label={t("send.fee")} aria-describedby="send-fee-hint">
              {(["slow", "normal", "fast"] as const).map((s) => (
                <button key={s} className={speed === s ? "selected" : ""} aria-pressed={speed === s} onClick={() => setSpeed(s)}>
                  {t(`send.speed.${s}`)} · {fees[s].toString()} sat/vB
                </button>
              ))}
            </div>
            <p className="dialog-note" id="send-fee-hint">{t("send.feeHint")}</p>
            {otherError && <p className="form-error" role="alert">{errorText(otherError)}</p>}
            <button className="primary-cta" onClick={review}>{t("send.review")}</button>
          </>
        )}

        {(phase.k === "review" || phase.k === "signing") && (
          <>
            <p className="field-label">{t("send.to")}</p>
            <div className="address-box chunked"><Chunked address={phase.plan.recipient} /></div>
            <table className="kv">
              <tbody>
                <tr><th scope="row">{t("send.amount")}</th><td>{btc(phase.plan.amount)} tBTC</td></tr>
                <tr><th scope="row">{t("send.fee")}</th><td>{btc(phase.plan.fee)} tBTC ({phase.plan.fee.toString()} sat)</td></tr>
                <tr className="total"><th scope="row">{t("send.total")}</th><td>{btc(phase.plan.amount + phase.plan.fee)} tBTC</td></tr>
              </tbody>
            </table>
            {phase.plan.fee * 10n > phase.plan.amount && <p className="dialog-note warn-note">{t("send.highFee")}</p>}
            <p className="dialog-note">{t("send.checkDevice")}</p>
            {phase.k === "review" ? (
              <div className="dialog-actions">
                <button className="text-button" onClick={() => setPhase({ k: "form" })} disabled={busy}>{t("send.back")}</button>
                <button className="primary-cta" onClick={sign} disabled={busy}>{t("send.sign")}</button>
              </div>
            ) : (
              <p><strong>{t("send.confirmOnDevice")}</strong></p>
            )}
          </>
        )}

        {phase.k === "done" && (
          <>
            <p><Check size={16} /> {t("send.done")}</p>
            <div className="address-box">{phase.txid}</div>
            <button className="text-button" onClick={() => void navigator.clipboard?.writeText(phase.txid)}><Copy size={14} /> {t("send.copyTxid")}</button>
            <a className="primary-cta" href={`${BTC_TESTNET.explorer}/tx/${phase.txid}`} target="_blank" rel="noopener noreferrer">
              {t("send.explorer")} <ArrowUpRight size={17} />
            </a>
          </>
        )}

        {phase.k === "error" && (
          <>
            <p className="form-error" role="alert">{errorText(phase.code)}</p>
            {phase.code === "broadcast-uncertain" && phase.txid && (
              <a className="primary-cta" href={`${BTC_TESTNET.explorer}/tx/${phase.txid}`} target="_blank" rel="noopener noreferrer">
                {t("send.explorer")} <ArrowUpRight size={17} />
              </a>
            )}
            {phase.code === "account-invalid" && (
              <a className="primary-cta" href="#/beveiliging" onClick={onClose}>{t("send.report")} <ArrowUpRight size={17} /></a>
            )}
            {!FATAL.has(phase.code) && (
              <button className="primary-cta" disabled={busy} onClick={() => (state && session.current && phase.code !== "disconnected" ? setPhase({ k: "form" }) : connect())}>
                {t("send.retry")}
              </button>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

const ERROR_KEYS: Record<string, true> = Object.fromEntries(
  [
    "unsupported", "cancelled", "locked", "busy", "wrong-app", "mainnet-app", "old-app", "rejected", "disconnected", "unknown",
    "address-empty", "address-mainnet", "address-invalid", "amount-invalid", "amount-too-small", "insufficient-funds",
    "fee-invalid", "fee-too-high", "scan-limit", "address-own-change", "account-invalid", "plan-mismatch", "utxo-mismatch", "signature-mismatch", "network",
    "broadcast-rejected", "broadcast-uncertain",
  ].map((c) => [`send.err.${c}`, true]),
);
