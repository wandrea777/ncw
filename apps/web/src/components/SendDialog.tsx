import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, Usb } from "lucide-react";
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
  | { k: "error"; code: string };

type Speed = keyof FeeRates;

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
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>({ k: "intro" });
  const session = useRef<LedgerSession | null>(null);
  const [state, setState] = useState<AccountState | null>(null);
  const [fees, setFees] = useState<FeeRates | null>(null);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [shown, setShown] = useState<null | "checking" | "ok">(null);
  const supported = webHidSupported();

  useEffect(() => {
    if (supported) void preloadLedger().catch(() => undefined);
    return () => void session.current?.close();
  }, [supported]);

  const fail = (e: unknown) => {
    const code = e instanceof LedgerError || e instanceof SendError ? e.code : "unknown";
    setPhase({ k: "error", code });
  };

  async function connect() {
    setPhase({ k: "connecting" });
    try {
      await session.current?.close();
      const s = await connectLedger();
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
    }
  }

  async function showOnDevice() {
    if (!session.current || !state) return;
    setShown("checking");
    try {
      const onDevice = await session.current.showAddress(0, state.nextReceive.index);
      setShown(onDevice === state.nextReceive.address ? "ok" : null);
      if (onDevice !== state.nextReceive.address) setPhase({ k: "error", code: "account-invalid" });
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
    if (!session.current || !state || !fees || phase.k !== "review") return;
    try {
      // Opnieuw bouwen met dezelfde invoer: de review toonde precies dit plan.
      const plan = planSend({ account: session.current.account, state, recipient, amount: phase.plan.amount, feeRate: fees[speed] });
      const ready = attachPrevTxs(plan, await fetchPrevTxs(plan.inputs));
      if (ready.fee !== phase.plan.fee || ready.recipient !== phase.plan.recipient) throw new SendError("plan-mismatch", "changed");
      setPhase({ k: "signing", plan: ready });
      const signed = finalizeSigned(ready.psbt, await session.current.sign(ready.psbt));
      setPhase({ k: "done", txid: await broadcast(signed) });
    } catch (e) {
      fail(e);
    }
  }

  const errorText = (code: string) => {
    const key = `send.err.${code}` as Key;
    return t(key in ERROR_KEYS ? key : "send.err.unknown");
  };

  return (
    <Dialog title={t("send.title")} onClose={onClose}>
      <p><span className="badge-line">{t("send.testnet")}</span></p>

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
              <button className="primary-cta" onClick={connect}>{t("send.connect")} <Usb size={17} /></button>
            </>
          ) : (
            <p className="dialog-note warn-note" role="alert">{t("send.unsupported")}</p>
          )}
        </>
      )}

      {phase.k === "connecting" && <p role="status">{t("send.connecting")}</p>}
      {phase.k === "scanning" && <p role="status">{t("send.scanning", { n: phase.checked })}</p>}

      {phase.k === "form" && state && fees && (
        <>
          <table className="kv">
            <tbody>
              <tr><th scope="row">{t("send.balance")}</th><td>{formatBtc(state.confirmed)} tBTC</td></tr>
              {state.pending > 0n && <tr><th scope="row">{t("send.pending")}</th><td>{formatBtc(state.pending)} tBTC</td></tr>}
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
            <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="tb1q…" spellCheck={false} autoComplete="off" autoCapitalize="off" aria-invalid={formError?.startsWith("address") ? true : undefined} />
          </label>
          {similar && <p className="dialog-note warn-note" role="alert">{t("send.similar", { a: `${similar.slice(0, 8)}…${similar.slice(-6)}` })}</p>}
          <label className="field">
            <span>{t("send.amount")}</span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,001" aria-invalid={formError?.startsWith("amount") ? true : undefined} />
          </label>
          <div className="segmented" role="group" aria-label={t("send.fee")}>
            {(["slow", "normal", "fast"] as const).map((s) => (
              <button key={s} className={speed === s ? "selected" : ""} aria-pressed={speed === s} onClick={() => setSpeed(s)}>
                {t(`send.speed.${s}`)} · {fees[s].toString()} sat/vB
              </button>
            ))}
          </div>
          {formError && <p className="form-error" role="alert">{errorText(formError)}</p>}
          <button className="primary-cta" onClick={review}>{t("send.review")}</button>
        </>
      )}

      {(phase.k === "review" || phase.k === "signing") && (
        <>
          <p className="field-label">{t("send.to")}</p>
          <div className="address-box chunked"><Chunked address={phase.plan.recipient} /></div>
          <table className="kv">
            <tbody>
              <tr><th scope="row">{t("send.amount")}</th><td>{formatBtc(phase.plan.amount)} tBTC</td></tr>
              <tr><th scope="row">{t("send.fee")}</th><td>{formatBtc(phase.plan.fee)} tBTC ({phase.plan.fee.toString()} sat)</td></tr>
              <tr className="total"><th scope="row">{t("send.total")}</th><td>{formatBtc(phase.plan.amount + phase.plan.fee)} tBTC</td></tr>
            </tbody>
          </table>
          {phase.plan.fee * 10n > phase.plan.amount && <p className="dialog-note warn-note">{t("send.highFee")}</p>}
          <p className="dialog-note">{t("send.checkDevice")}</p>
          {phase.k === "review" ? (
            <div className="dialog-actions">
              <button className="text-button" onClick={() => setPhase({ k: "form" })}>{t("send.back")}</button>
              <button className="primary-cta" onClick={sign}>{t("send.sign")}</button>
            </div>
          ) : (
            <p role="status"><strong>{t("send.confirmOnDevice")}</strong></p>
          )}
        </>
      )}

      {phase.k === "done" && (
        <>
          <p role="status"><Check size={16} /> {t("send.done")}</p>
          <div className="address-box">{phase.txid}</div>
          <a className="primary-cta" href={`${BTC_TESTNET.explorer}/tx/${phase.txid}`} target="_blank" rel="noopener noreferrer">
            {t("send.explorer")} <ArrowUpRight size={17} />
          </a>
        </>
      )}

      {phase.k === "error" && (
        <>
          <p className="form-error" role="alert">{errorText(phase.code)}</p>
          <button className="primary-cta" onClick={() => (state && session.current && phase.code !== "disconnected" ? setPhase({ k: "form" }) : connect())}>
            {t("send.retry")}
          </button>
        </>
      )}
    </Dialog>
  );
}

const ERROR_KEYS: Record<string, true> = Object.fromEntries(
  [
    "unsupported", "cancelled", "locked", "wrong-app", "mainnet-app", "old-app", "rejected", "disconnected", "unknown",
    "address-empty", "address-mainnet", "address-invalid", "amount-invalid", "amount-too-small", "insufficient-funds",
    "fee-invalid", "account-invalid", "plan-mismatch", "utxo-mismatch", "signature-mismatch", "network",
  ].map((c) => [`send.err.${c}`, true]),
);
