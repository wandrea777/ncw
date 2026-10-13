import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { checkAddress } from "@ncw/core";
import { Dialog } from "./Dialog";
import { useI18n } from "../i18n";
import { looksLikeSecret } from "../lib/secrets";
import type { WatchedAddress } from "../lib/storage";

export function AddAddressDialog({ existing, onClose, onAdd }: { existing: WatchedAddress[]; onClose(): void; onAdd(w: WatchedAddress): void }) {
  const { t, lang } = useI18n();
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (looksLikeSecret(value)) {
      setValue("");
      return setError(t("add.secretWarning"));
    }
    const r = checkAddress(value.trim());
    if (!r.ok) return setError(lang === "NL" ? r.reason : t("add.invalid"));
    if (existing.some((e) => e.address.toLowerCase() === r.normalized.toLowerCase())) return setError(t("add.duplicate"));
    onAdd({ address: r.normalized, chain: r.chain, label: label.trim() || undefined, addedAt: Date.now() });
  }

  return (
    <Dialog title={t("add.title")} onClose={onClose}>
      <p>{t("add.text")}</p>
      <form onSubmit={(e) => (e.preventDefault(), submit())}>
        <label className="field">
          <span>{t("add.label")}</span>
          <input value={value} onChange={(e) => (setValue(e.target.value), setError(null))} placeholder="bc1… / 0x…" spellCheck={false} autoComplete="off" aria-invalid={error ? true : undefined} />
        </label>
        <label className="field">
          <span>{t("add.labelName")}</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} autoComplete="off" />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-cta" type="submit" disabled={!value.trim()}>{t("add.submit")} <ArrowUpRight size={17} /></button>
      </form>
      <p className="dialog-note spaced">{t("add.storage")}</p>
    </Dialog>
  );
}
