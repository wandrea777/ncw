import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Dialog } from "./Dialog";
import { useI18n } from "../i18n";
import { authErrorKey, login, register, type User } from "../lib/api";

/** Passkey-registratie en -login tegen de KERN-API. Inloggen geeft toegang tot je account, nooit ondertekenrecht. */
export function AuthDialog({ mode: initial, onClose, onSignedIn }: { mode: "create" | "signin"; onClose(): void; onSignedIn(u: User): void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (mode === "create" && !name.trim()) return setError(t("auth.nameRequired"));
    setBusy(true);
    try {
      onSignedIn(mode === "create" ? await register(name.trim()) : await login());
    } catch (e) {
      const k = authErrorKey(e);
      setError(k ? t(k) : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={mode === "create" ? t("auth.createTitle") : t("auth.signInTitle")} onClose={onClose}>
      <p>{mode === "create" ? t("auth.createText") : t("auth.signInText")}</p>
      <form onSubmit={(e) => (e.preventDefault(), void submit())}>
        {mode === "create" && (
          <label className="field">
            <span>{t("auth.name")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="nickname" placeholder={t("auth.namePlaceholder")} />
          </label>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-cta" type="submit" disabled={busy}>
          {busy ? t("auth.busy") : mode === "create" ? t("auth.create") : t("auth.signIn")} <ArrowUpRight size={17} />
        </button>
      </form>
      <div className="dialog-switch">
        {mode === "create" ? t("auth.haveAccount") : t("auth.noAccount")}
        <button className="text-button" onClick={() => (setMode(mode === "create" ? "signin" : "create"), setError(null))}>
          {mode === "create" ? t("auth.signInLink") : t("auth.createLink")} <ArrowUpRight size={13} />
        </button>
      </div>
    </Dialog>
  );
}
