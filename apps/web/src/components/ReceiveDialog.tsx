import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import qrcode from "qrcode-generator";
import { ASSETS } from "@ncw/core";
import { Dialog } from "./Dialog";
import { useI18n } from "../i18n";
import type { WatchedAddress } from "../lib/storage";

function Qr({ text, label }: { text: string; label: string }) {
  const cells = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const out: Array<[number, number]> = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) out.push([c, r]);
    return { n, out };
  }, [text]);
  return (
    <svg className="qr" viewBox={`0 0 ${cells.n} ${cells.n}`} role="img" aria-label={label} shapeRendering="crispEdges">
      {cells.out.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#171c1b" />)}
    </svg>
  );
}

/** Het volledige adres in blokjes van 4, afwisselend benadrukt: zo controleer je elk teken, niet alleen begin en eind. */
function Chunked({ address }: { address: string }) {
  const parts = address.match(/.{1,4}/g) ?? [address];
  return <>{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <span key={i}>{p}</span>))}</>;
}

export function ReceiveDialog({ watched, onClose, onCopy }: { watched: WatchedAddress[]; onClose(): void; onCopy(address: string): void }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const w = watched[i];
  if (!w) return <Dialog title={t("recv.title")} onClose={onClose}><p>{t("recv.none")}</p></Dialog>;
  const asset = ASSETS[w.chain];
  const uri = w.chain === "bitcoin" ? `bitcoin:${w.address}` : w.address;
  return (
    <Dialog title={t("recv.title")} onClose={onClose}>
      <p>{t("recv.text")}</p>
      {watched.length > 1 && (
        <div className="segmented" role="group" aria-label={t("recv.choose")}>
          {watched.map((x, j) => (
            <button key={x.address} className={j === i ? "selected" : ""} aria-pressed={j === i} onClick={() => setI(j)}>
              {ASSETS[x.chain].symbol} · {x.label ?? `${x.address.slice(0, 6)}…${x.address.slice(-4)}`}
            </button>
          ))}
        </div>
      )}
      <Qr text={uri} label={`QR-code ${asset.symbol} ${w.address}`} />
      <div className="address-box chunked"><Chunked address={w.address} /></div>
      <p className="dialog-note">{t("recv.network", { asset: asset.symbol, net: w.chain === "bitcoin" ? "Bitcoin" : "Ethereum" })}</p>
      <p className="dialog-note warn-note">{t("recv.ownOnly")}</p>
      <button className="primary-cta" onClick={() => onCopy(w.address)}>
        {t("recv.copy")} <Copy size={16} />
      </button>
    </Dialog>
  );
}

export function SendDialog({ onClose }: { onClose(): void }) {
  const { t } = useI18n();
  return (
    <Dialog title={t("send.title")} onClose={onClose}>
      <p><span className="badge-line">{t("send.status")}</span></p>
      <p>{t("send.text")}</p>
    </Dialog>
  );
}
