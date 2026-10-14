import { Component, type ReactNode } from "react";
import { Dialog } from "./Dialog";
import { useI18n } from "../i18n";

function LoadFailed({ onClose }: { onClose(): void }) {
  const { t } = useI18n();
  return (
    <Dialog title={t("send.title")} onClose={onClose}>
      <p className="form-error" role="alert">{t("send.loadFailed")}</p>
      <button className="primary-cta" onClick={() => window.location.reload()}>{t("send.reload")}</button>
    </Dialog>
  );
}

/**
 * Vangt een mislukte lazy import op (bijv. een oude chunk na een nieuwe deploy). Zonder deze grens zou React de
 * hele app ontkoppelen en zie je een lege pagina.
 */
export class LazyBoundary extends Component<{ onClose(): void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <LoadFailed onClose={this.props.onClose} /> : this.props.children;
  }
}
