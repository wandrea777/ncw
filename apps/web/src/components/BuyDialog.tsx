import { useMemo, useState } from "react";
import { ArrowUpRight, Copy } from "lucide-react";
import { ASSETS, ONRAMP_PARTNERS, type Chain } from "@ncw/core";
import { Dialog } from "./Dialog";
import { useI18n } from "../i18n";
import { onrampConfig } from "../lib/onrampConfig";
import { buyLink } from "../lib/buyLink";
import type { WatchedAddress } from "../lib/storage";

/**
 * Geld toevoegen = crypto kopen bij een partner met MiCA-vergunning (ADR-0014). KERN verwijst alleen door:
 * de partner doet betaling, identiteitscontrole en levering. De link opent in een nieuw tabblad, zonder referrer.
 */
export function BuyDialog({ watched, onClose, onCopy }: { watched: WatchedAddress[]; onClose(): void; onCopy(a: string): void }) {
  const { t } = useI18n();
  const cfg = onrampConfig();
  const [chain, setChain] = useState<Chain>(watched[0]?.chain ?? "bitcoin");
  const own = watched.filter((w) => w.chain === chain);
  const [address, setAddress] = useState<string>(own[0]?.address ?? "");
  const [confirmedOwn, setConfirmedOwn] = useState(false);
  const [amount, setAmount] = useState("100");
  const link = useMemo(
    () => (cfg ? buyLink(cfg, { chain, amount, address, confirmedOwn }, watched, window.location.origin) : null),
    [cfg, chain, amount, address, confirmedOwn, watched],
  );

  if (!cfg || !link) {
    return (
      <Dialog title={t("buy.title")} onClose={onClose}>
        <p><span className="badge-line">{t("buy.inactive")}</span></p>
        <p>{t("buy.inactiveText")}</p>
      </Dialog>
    );
  }
  const partner = ONRAMP_PARTNERS[cfg.provider];
  const pick = (c: Chain) => {
    setChain(c);
    setAddress(watched.find((w) => w.chain === c)?.address ?? "");
    setConfirmedOwn(false);
  };

  return (
    <Dialog title={t("buy.title")} onClose={onClose}>
      <p>{t("buy.text", { partner: partner.name })}</p>
      {cfg.env === "demo" && <p><span className="badge-line">{t("buy.demo")}</span></p>}
      <div className="segmented" role="group" aria-label={t("buy.asset")}>
        {(["bitcoin", "ethereum"] as const).map((c) => (
          <button key={c} className={chain === c ? "selected" : ""} aria-pressed={chain === c} onClick={() => pick(c)}>
            {ASSETS[c].symbol}
          </button>
        ))}
      </div>
      <label className="field">
        <span>{t("buy.amount")}</span>
        <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100" aria-invalid={!link.ok && link.reason === "amount" ? true : undefined} />
      </label>
      {!link.ok && link.reason === "amount" && <p className="form-error" role="alert">{t("buy.amountInvalid")}</p>}

      {own.length > 0 ? (
        <>
          <label className="field">
            <span>{t("buy.to")}</span>
            <select value={address} onChange={(e) => (setAddress(e.target.value), setConfirmedOwn(false))}>
              {own.map((w) => <option key={w.address} value={w.address}>{w.label ? `${w.label} · ` : ""}{w.address.slice(0, 10)}…{w.address.slice(-8)}</option>)}
            </select>
          </label>
          <div className="address-box">{address}</div>
          {partner.prefillsAddress ? (
            <label className="check">
              <input type="checkbox" checked={confirmedOwn} onChange={(e) => setConfirmedOwn(e.target.checked)} />
              <span>{t("buy.confirmOwn")}</span>
            </label>
          ) : (
            <p className="dialog-note">
              {t("buy.pasteAddress", { partner: partner.name })}{" "}
              <button className="text-button" onClick={() => onCopy(address)}><Copy size={13} /> {t("recv.copy")}</button>
            </p>
          )}
        </>
      ) : (
        <p className="dialog-note">{t("buy.noAddress")}</p>
      )}
      {link.ok && partner.prefillsAddress && !link.prefilled && own.length > 0 && <p className="dialog-note">{t("buy.noPrefill", { partner: partner.name })}</p>}

      {link.ok ? (
        <a className="primary-cta" href={link.url} target="_blank" rel="noopener noreferrer" onClick={onClose}>
          {t("buy.go", { partner: partner.name })} <ArrowUpRight size={17} />
        </a>
      ) : (
        <button className="primary-cta" disabled>{t("buy.go", { partner: partner.name })} <ArrowUpRight size={17} /></button>
      )}
      <p className="dialog-note spaced">{t("buy.disclosure", { partner: partner.name, entity: partner.entity, license: partner.license })}</p>
    </Dialog>
  );
}
