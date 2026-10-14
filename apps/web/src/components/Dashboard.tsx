import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronDown,
  Copy,
  ExternalLink,
  Fingerprint,
  Layers3,
  LockKeyhole,
  LogOut,
  MoreHorizontal,
  Plus,
  Receipt,
  RefreshCw,
  Send,
  ShieldCheck,
  Timer,
  Trash2,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { ASSETS, utcDayKey, valueSeries, type ActivityItem, type Holding } from "@ncw/core";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { useI18n, type Key } from "../i18n";
import { Mark } from "./Mark";
import { AddAddressDialog } from "./AddAddressDialog";
import { ReceiveDialog } from "./ReceiveDialog";
import { Dialog } from "./Dialog";
import { LazyBoundary } from "./LazyBoundary";
// Lui geladen: de Ledger- en transactiecode komt alleen binnen wie op Versturen klikt.
const SendDialog = lazy(() => import("./SendDialog"));
import { BuyDialog } from "./BuyDialog";
import { Tool } from "../pages/Tool";
import { usePortfolio, type Portfolio } from "../lib/usePortfolio";
import { loadWatched, saveWatched, type WatchedAddress } from "../lib/storage";
import { passkeys as fetchPasskeys, revokeOtherSessions, type Me, type Passkey } from "../lib/api";
import { useDismiss } from "../lib/useDismiss";
import { formatAmount, formatEur, formatPct, splitEur } from "../lib/format";

const TABS = ["overview", "assets", "activity", "tax", "security"] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON = { overview: Layers3, assets: WalletCards, activity: TrendingUp, tax: Receipt, security: ShieldCheck };
const TAB_KEY: Record<Tab, Key> = { overview: "tab.overview", assets: "tab.assets", activity: "tab.activity", tax: "tab.tax", security: "tab.security" };

const PERIODS = [
  { id: "1W", days: 7 },
  { id: "1M", days: 30 },
  { id: "1Y", days: 365 },
  { id: "ALL", days: 0 },
] as const;
type Period = (typeof PERIODS)[number]["id"];

const NAME: Record<Holding["asset"]["symbol"], string> = { BTC: "Bitcoin", ETH: "Ethereum" };
const MARK: Record<Holding["asset"]["symbol"], string> = { BTC: "₿", ETH: "◆" };
const DAY = 86_400_000;

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "K";
}

export function Dashboard({ me, onSignOut }: { me: Me; onSignOut(wipe: boolean): void }) {
  const { t, lang, setLang, locale } = useI18n();
  const [tab, setTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState<Period>("1M");
  const [hidden, setHidden] = useState(false);
  const [watched, setWatched] = useState<WatchedAddress[]>(() => loadWatched(me.user.id));
  const [dialog, setDialog] = useState<null | "add" | "receive" | "send" | "buy">(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useDismiss<HTMLDivElement>(profileOpen, () => setProfileOpen(false));
  const { data, loading, errors, priceError, reload } = usePortfolio(watched, period === "ALL" ? "all" : 1);
  const notify = (text: string, ok = true) => setToast({ text, ok });
  const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => notify(t("recv.copied")), () => notify(t("copyFailed"), false));

  useEffect(() => saveWatched(me.user.id, watched), [me.user.id, watched]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(id);
  }, [toast]);

  const pending = data === null;
  const closeDialog = useCallback(() => setDialog(null), []);
  const eur = (n: number) => (hidden ? "€ •••••" : formatEur(n, locale));
  const hour = new Date().getHours();
  const greet = t(hour < 12 ? "greet.morning" : hour < 18 ? "greet.afternoon" : "greet.evening");
  const firstName = me.user.displayName.split(/\s+/)[0];
  const today = new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const snap = data?.snap;

  const header = (
    <header className="dash-header">
      <div>
        <p className="eyebrow">{today}</p>
        <h1>{greet}, {firstName}.</h1>
      </div>
      <div className="header-actions">
        <button className="icon-button lang-switch" title={t("lang.switch")} onClick={() => setLang(lang === "NL" ? "EN" : "NL")}>{lang}<ChevronDown size={13} /></button>
        <button className="icon-button notification" aria-label={t("refresh")} title={t("refresh")} onClick={reload} disabled={loading}><RefreshCw size={14} /></button>
        <button className="add-button" onClick={() => setDialog("buy")}><Plus size={17} /> {t("addFunds")}</button>
      </div>
    </header>
  );

  const statusLine = (
    <>
      {loading && <p className="status-line" role="status">{t("loading")}</p>}
      {errors.map((e) => (
        <p className="status-line error" role="alert" key={e.address}>
          {t("addressError", { address: `${e.address.slice(0, 8)}…${e.address.slice(-6)}` })} {lang === "NL" ? e.message : ""}{" "}
          <button className="text-button" onClick={reload}>{t("retry")}</button>
        </p>
      ))}
      {priceError && (
        <p className="status-line error" role="alert">
          {t("priceError")} {lang === "NL" ? priceError : ""} <button className="text-button" onClick={reload}>{t("retry")}</button>
        </p>
      )}
    </>
  );

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><Mark small /><span>KERN</span></div>
        <div className="network-pill"><span className="online-dot" /> {t("network")}</div>
        <nav className="side-nav" aria-label={t("dash.nav")}>
          {TABS.map((item) => {
            const Icon = TAB_ICON[item];
            return (
              <button key={item} className={tab === item ? "nav-item active" : "nav-item"} aria-current={tab === item ? "page" : undefined} onClick={() => setTab(item)}>
                <Icon size={17} />
                {t(TAB_KEY[item])}
                {item === "security" && <span className="nav-status" />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="security-mini"><LockKeyhole size={16} /><div><strong>{t("mini.title")}</strong><span>{t("mini.text")}</span></div></div>
          <div className="profile-menu" ref={profileRef}>
            {profileOpen && (
              <div className="profile-pop" id="profiel-menu">
                <button onClick={() => onSignOut(false)}><LogOut size={14} /> {t("signOut")}</button>
                <button onClick={() => onSignOut(true)}><Trash2 size={14} /> {t("signOutWipe")}</button>
              </div>
            )}
            <button className="profile" aria-expanded={profileOpen} aria-controls="profiel-menu" title={t("profileMenu")} onClick={() => setProfileOpen(!profileOpen)}>
              <span className="avatar">{initials(me.user.displayName)}</span>
              <span className="profile-name">{me.user.displayName}</span>
              <MoreHorizontal size={17} />
            </button>
          </div>
        </div>
      </aside>

      <section className="dashboard-main">
        {header}
        {tab === "overview" ? (
          <>
            <div className="balance-grid">
              <section className="balance-block">
                <div className="balance-label">
                  {t("total")}{" "}
                  <button className="visibility" aria-label={hidden ? t("showBalance") : t("hideBalance")} aria-pressed={hidden} onClick={() => setHidden(!hidden)}>◌</button>
                </div>
                {pending ? <div className="balance-number">—</div> : <Balance value={snap?.totalEur ?? 0} hidden={hidden} locale={locale} />}
                <div className="balance-change">
                  {snap && snap.holdings.length > 0 && snap.changeEur != null && !hidden ? (
                    <>
                      <span>{(snap.changeEur >= 0 ? "+" : "−") + formatEur(Math.abs(snap.changeEur), locale)}</span>
                      <span className="muted">{t("vsYesterday")}</span>
                      <span className={snap.change! >= 0 ? "positive" : ""}>{formatPct(snap.change!, locale)}</span>
                    </>
                  ) : (
                    <span className="muted">{t(watched.length === 1 ? "addressCount.one" : "addressCount", { n: watched.length })}</span>
                  )}
                </div>
              </section>
              <div className="quick-actions">
                <button onClick={() => setDialog("send")}><Send size={18} /><span>{t("send")}</span></button>
                <button onClick={() => setDialog("receive")} disabled={watched.length === 0}><ArrowDownLeft size={18} /><span>{t("receive")}</span></button>
                <button onClick={() => setTab("tax")}><Receipt size={18} /><span>{t("tax")}</span></button>
              </div>
            </div>
            {statusLine}

            {watched.length === 0 ? (
              <div className="empty-state">
                <div><strong>{t("empty.title")}</strong><span>{t("empty.text")}</span></div>
                <button className="inline-action" onClick={() => setDialog("add")}><Plus size={17} /> {t("addAddress")}</button>
              </div>
            ) : (
              <Chart data={data} period={period} setPeriod={setPeriod} hidden={hidden} loading={loading} />
            )}

            <div className="lower-grid">
              <section>
                <div className="section-heading compact">
                  <div><p className="eyebrow">{t("yourAssets")}</p><h2>{t("holdings")}</h2></div>
                  <div className="heading-actions">
                    <button className="text-button" onClick={() => setDialog("add")}><Plus size={13} /> {t("addAddress")}</button>
                    <button className="text-button" onClick={() => setTab("assets")}>{t("viewAll")} <ExternalLink size={13} /></button>
                  </div>
                </div>
                <Holdings holdings={snap?.holdings ?? []} eur={eur} pending={pending} />
              </section>
              <section>
                <div className="section-heading compact">
                  <div><p className="eyebrow">{t("latest")}</p><h2>{t("activity")}</h2></div>
                  <button className="text-button" onClick={() => setTab("activity")}>{t("viewAll")} <ExternalLink size={13} /></button>
                </div>
                <Activity items={(data?.items ?? []).slice(0, 3)} data={data} eur={eur} pending={pending} />
              </section>
            </div>
          </>
        ) : (
          <section className="tab-page">
            <div className="section-heading">
              <div>
                <p className="eyebrow">KERN / {t(TAB_KEY[tab])}</p>
                <h2>{tab === "assets" ? t("yourAssets") : tab === "activity" ? t("txHistory") : tab === "tax" ? t("boxTitle") : t("securityCenter")}</h2>
              </div>
              {(tab === "assets" || tab === "activity") && <button className="add-button" onClick={() => setDialog("add")}><Plus size={17} /> {t("addAddress")}</button>}
            </div>
            {tab !== "security" && tab !== "tax" && statusLine}
            {tab === "assets" && (
              <>
                <div className="full-list"><Holdings holdings={snap?.holdings ?? []} eur={eur} pending={pending} /></div>
                <h3 className="subheading">{t("addresses")}</h3>
                <div className="address-list">
                  {watched.map((w) => (
                    <div className="address-row" key={w.address}>
                      <span className="chain">{ASSETS[w.chain].symbol}</span>
                      <code>{w.label ? `${w.label} · ` : ""}{w.address}</code>
                      <button className="row-action" aria-label={`${t("recv.copy")}: ${w.address}`} onClick={() => copy(w.address)}><Copy size={15} /></button>
                      <button className="row-action" aria-label={`${t("remove")}: ${w.address}`} onClick={() => setWatched(watched.filter((x) => x !== w))}><Trash2 size={15} /></button>
                    </div>
                  ))}
                  {watched.length === 0 && <p className="muted">{t("empty.text")}</p>}
                </div>
              </>
            )}
            {tab === "activity" && <div className="full-list"><Activity items={(data?.items ?? []).slice(0, 200)} data={data} eur={eur} pending={pending} /></div>}
            {tab === "tax" && <Tool disabled={false} initialAddresses={watched} premium />}
            {tab === "security" && <SecurityTab me={me} onToast={notify} />}
          </section>
        )}
        <footer className="dash-footer">
          <span>{t("footer.dash")}</span>
          <span>{t("footer.version", { v: `${__APP_VERSION__} (${__APP_COMMIT__})` })}</span>
        </footer>
      </section>

      {dialog === "add" && <AddAddressDialog existing={watched} onClose={closeDialog} onAdd={(w) => (setWatched([...watched, w]), setDialog(null))} />}
      {dialog === "receive" && <ReceiveDialog watched={watched} onClose={closeDialog} onCopy={(a) => (setDialog(null), copy(a))} />}
      {dialog === "send" && (
        <LazyBoundary onClose={closeDialog}>
          <Suspense fallback={<Dialog title={t("send.title")} onClose={closeDialog}><p role="status">{t("send.loading")}</p></Dialog>}>
            <SendDialog watched={watched} onClose={closeDialog} />
          </Suspense>
        </LazyBoundary>
      )}
      {dialog === "buy" && <BuyDialog watched={watched} onClose={closeDialog} onCopy={copy} />}
      {toast && <div className="toast" role="status">{toast.ok ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />} {toast.text}</div>}
    </main>
  );
}

function Balance({ value, hidden, locale }: { value: number; hidden: boolean; locale: string }) {
  if (hidden) return <div className="balance-number">€ •••••</div>;
  const [whole, frac] = splitEur(value, locale);
  return <div className="balance-number">{whole}<span>{frac}</span></div>;
}

function Holdings({ holdings, eur, pending }: { holdings: Holding[]; eur(n: number): string; pending: boolean }) {
  const { t, locale } = useI18n();
  if (pending) return <div className="asset-list"><p className="muted">—</p></div>;
  if (holdings.length === 0) return <div className="asset-list"><p className="muted">{t("noHoldings")}</p></div>;
  return (
    <div className="asset-list">
      {holdings.map((h) => (
        <div className="asset-row" key={h.asset.symbol}>
          <span className={`asset-icon ${h.asset.symbol.toLowerCase()}`} aria-hidden="true">{MARK[h.asset.symbol]}</span>
          <div className="asset-name"><strong>{NAME[h.asset.symbol]}</strong><span>{formatAmount(h.amount, h.asset.symbol, locale)}</span></div>
          <div className="asset-value">
            <strong>{eur(h.valueEur)}</strong>
            {h.change !== null && <span className={h.change >= 0 ? "positive" : ""}>{formatPct(h.change, locale)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Activity({ items, data, eur, pending }: { items: ActivityItem[]; data: Portfolio | null; eur(n: number): string; pending: boolean }) {
  const { t, locale } = useI18n();
  if (pending) return <div className="activity-list"><p className="muted">—</p></div>;
  if (items.length === 0) return <div className="activity-list"><p className="muted">{t("noActivity")}</p></div>;
  return (
    <div className="activity-list">
      {items.map((tx) => {
        const price = data?.books[tx.asset.symbol]?.priceOn(utcDayKey(tx.timestamp)) ?? null;
        const value = price === null ? null : tx.amount * price;
        const label = tx.type === "receive" ? t("received") : tx.type === "send" ? t("sent") : t("internal");
        const Icon = tx.type === "receive" ? ArrowDownLeft : tx.type === "send" ? ArrowUpRight : ArrowLeftRight;
        const date = new Date(tx.timestamp).toLocaleString(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
        return (
          <div className="activity-row" key={tx.asset.symbol + tx.id}>
            <span className={tx.type === "receive" ? "activity-icon receive" : "activity-icon"}><Icon size={16} /></span>
            <div className="activity-name"><strong>{label} {NAME[tx.asset.symbol]}</strong><span>{date}</span></div>
            <div className="activity-value">
              <strong className={tx.type === "receive" ? "positive" : ""}>
                {value === null ? "—" : `${tx.type === "receive" ? "+ " : tx.type === "send" ? "− " : ""}${eur(value)}`}
              </strong>
              <span>{formatAmount(tx.amount, tx.asset.symbol, locale)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Chart({ data, period, setPeriod, hidden, loading }: { data: Portfolio | null; period: Period; setPeriod(p: Period): void; hidden: boolean; loading: boolean }) {
  const { t, locale } = useI18n();
  const points = useMemo(() => {
    if (!data || data.histories.length === 0) return [];
    const end = Math.max(...Object.values(data.books).map((b) => b!.lastDay()));
    const first = Math.min(...data.histories.flatMap((h) => h.flows.map((f) => f.timestamp)), end);
    const def = PERIODS.find((p) => p.id === period)!;
    const days = def.days || Math.max(2, Math.ceil((end - first) / DAY) + 1);
    const pts = valueSeries(data.histories, data.books, end, days);
    // Laatste punt = de actuele waarde uit de kop (saldo van nu), niet het saldo aan het begin van de dag.
    const last = pts.at(-1);
    if (last && last.t === data.snap.priceDay) pts[pts.length - 1] = { t: last.t, valueEur: data.snap.totalEur };
    return pts;
  }, [data, period]);

  const total = data?.snap.totalEur ?? 0;
  const max = Math.max(...points.map((p) => p.valueEur), 1);
  const min = Math.min(...points.map((p) => p.valueEur), max);
  const span = max - min || max || 1;
  const xy = points.map((p, i) => [points.length > 1 ? (i / (points.length - 1)) * 800 : 400, 200 - ((p.valueEur - min) / span) * 180] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const ticks = [max, min + span * (2 / 3), min + span / 3, min];
  const short = (n: number) => (hidden ? "•••" : new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 }).format(n));
  const xLabels = points.length ? [0, 0.25, 0.5, 0.75, 1].map((f) => points[Math.round(f * (points.length - 1))]!.t) : [];

  return (
    <section className="chart-panel">
      <div className="section-heading">
        <div><p className="eyebrow">{t("perf")}</p><h2>{hidden ? "€ •••••" : data ? formatEur(total, locale) : "—"}</h2></div>
        <div className="periods" role="group" aria-label={t("period")}>
          {PERIODS.map((p) => (
            <button key={p.id} className={period === p.id ? "selected" : ""} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>{p.id}</button>
          ))}
        </div>
      </div>
      <div className="chart-wrap">
        {points.length < 2 ? (
          <div className="chart-empty">{loading || !data ? t("loading") : t("chartEmpty")}</div>
        ) : (
          <>
            <div className="chart-y">{ticks.map((v, i) => <span key={i}>{short(v)}</span>)}</div>
            <svg viewBox="0 0 800 220" preserveAspectRatio="none" className="line-chart" role="img" aria-label={t("chartLabel")}>
              <path d={line} fill="none" stroke="#31594B" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
              <path d={`${line} V220 H0Z`} fill="url(#area)" opacity=".12" />
              <defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#31594B" /><stop offset="1" stopColor="#31594B" stopOpacity="0" /></linearGradient></defs>
            </svg>
            <div className="chart-x">{xLabels.map((tm, i) => <span key={i}>{new Date(tm).toLocaleDateString(locale, { day: "2-digit", month: "short", timeZone: "UTC" })}</span>)}</div>
          </>
        )}
      </div>
      {data && data.histories.length > 0 && (
        <p className="price-note">{t("priceNote", { day: new Date(data.snap.priceDay).toLocaleDateString(locale, { timeZone: "UTC" }) })}</p>
      )}
    </section>
  );
}

function SecurityTab({ me, onToast }: { me: Me; onToast(text: string, ok?: boolean): void }) {
  const { t, locale } = useI18n();
  const [list, setList] = useState<Passkey[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    fetchPasskeys().then(setList, () => setFailed(true));
  }, []);
  useEffect(load, [load]);
  const count = list?.length ?? me.passkeys;
  return (
    <>
      <div className="security-grid">
        <div className="security-card">
          <Fingerprint size={22} /><strong>{t("s.passkeys")}</strong>
          <span>{t(count === 1 ? "s.passkeysText.one" : "s.passkeysText", { n: count })}</span>
          <b>{t("s.active")}</b>
        </div>
        <div className="security-card"><ShieldCheck size={22} /><strong>{t("s.keys")}</strong><span>{t("s.keysText")}</span><b>{t("s.watch")}</b></div>
        <div className="security-card">
          <Timer size={22} /><strong>{t("s.session")}</strong><span>{t("s.sessionText")}</span><b>{t("s.enabled")}</b>
          <button
            className="inline-action"
            onClick={() => void revokeOtherSessions().then((r) => onToast(t("s.revoked", { n: r.revoked })), () => onToast(t("s.revokeFailed"), false))}
          >
            <LogOut size={15} /> {t("s.revoke")}
          </button>
        </div>
      </div>
      <h3 className="subheading">{t("s.passkeyList")}</h3>
      <div className="address-list">
        {failed && (
          <p className="status-line error" role="alert">
            {t("s.loadFailed")} <button className="text-button" onClick={load}>{t("retry")}</button>
          </p>
        )}
        {!failed && list === null && <p className="muted">{t("loading")}</p>}
        {(list ?? []).map((p) => (
          <div className="address-row" key={p.credentialId}>
            <span className="chain"><Fingerprint size={15} /></span>
            <code>{p.credentialId.slice(0, 16)}…</code>
            <span className="muted">{p.backedUp ? t("s.synced") : t("s.device")} · {t("s.created", { d: new Date(p.createdAt).toLocaleDateString(locale) })}</span>
          </div>
        ))}
      </div>
    </>
  );
}
