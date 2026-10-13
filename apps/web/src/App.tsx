import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { I18nProvider, translate, type Lang } from "./i18n";
import { Landing } from "./components/Landing";
import { Dashboard } from "./components/Dashboard";
import { AuthDialog } from "./components/AuthDialog";
import { Mark } from "./components/Mark";
import { Privacy } from "./pages/Privacy";
import { Voorwaarden } from "./pages/Voorwaarden";
import { Beveiliging } from "./pages/Beveiliging";
import { checkSession, logout, me as fetchMe, type Me } from "./lib/api";
import { CHECK_INTERVAL_MS, canShowWallet, idleExpired, logoutConfirmed } from "./lib/session";
import { clearDevice, loadLang, saveLang } from "./lib/storage";

type Route = "" | "wallet" | "privacy" | "voorwaarden" | "beveiliging";
const ROUTES: Route[] = ["wallet", "privacy", "voorwaarden", "beveiliging"];

function currentRoute(): Route {
  const r = window.location.hash.replace(/^#\/?/, "");
  return (ROUTES as string[]).includes(r) ? (r as Route) : "";
}

interface Status {
  blocked: boolean;
  message: string;
}

/** Noodstop: /status.json kan de app direct uitschakelen bij een incident, zonder nieuwe release. */
function useStatus(): Status | null {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    fetch("/status.json", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Status>) : { blocked: false, message: "" }))
      .then(setStatus)
      .catch(() => setStatus({ blocked: false, message: "" }));
  }, []);
  return status;
}

export function App() {
  const [route, setRoute] = useState<Route>(currentRoute());
  const [lang, setLangState] = useState<Lang>(() => loadLang() ?? "NL");
  const [session, setSession] = useState<Me | null | undefined>(undefined);
  const [auth, setAuth] = useState<null | "create" | "signin">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const status = useStatus();

  const setLang = (l: Lang) => (setLangState(l), saveLang(l));
  useEffect(() => void (document.documentElement.lang = lang.toLowerCase()), [lang]);

  const refresh = useCallback(() => fetchMe().then(setSession, () => setSession(null)), []);
  useEffect(() => void refresh(), [refresh]);

  useEffect(() => {
    const onHash = () => (setRoute(currentRoute()), window.scrollTo(0, 0));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (r: Route) => (window.location.hash = r ? `#/${r}` : "#/");
  const openWallet = () => (session ? go("wallet") : setAuth("signin"));
  const create = () => (session ? go("wallet") : setAuth("create"));
  // Alleen "uitgelogd" tonen als de server het bevestigt; bij een fout blijft de sessie mogelijk geldig.
  const signOut = (wipe: boolean) => {
    if (wipe) clearDevice();
    void logout().then(
      () => (setSession(null), go("")),
      (e: unknown) => (logoutConfirmed(e) ? (setSession(null), go("")) : setNotice(translate(lang, "signOutFailed"))),
    );
  };

  const langRef = useRef(lang);
  langRef.current = lang;

  // Sessie volgen: periodiek controleren bij de server (zonder te verlengen) en uitloggen na inactiviteit
  // (zelfde termijn als de server). Alleen een 401 telt als verlopen; een netwerkfout logt niemand uit.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    let last = Date.now();
    const touch = () => (last = Date.now());
    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const id = window.setInterval(() => {
      if (idleExpired(last, Date.now())) {
        void logout().catch(() => undefined); // de server verloopt zelf na dezelfde termijn
        setSession(null);
        setNotice(translate(langRef.current, "sessionExpired"));
        return;
      }
      void checkSession().then((s) => {
        if (cancelled || s !== "expired") return;
        setSession(null);
        setNotice(translate(langRef.current, "sessionExpired"));
      });
    }, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      events.forEach((e) => window.removeEventListener(e, touch));
      window.clearInterval(id);
    };
  }, [session]);

  // Zonder geldige sessie geen dashboard: terug naar de landing met de inlogdialoog.
  useEffect(() => {
    if (route === "wallet" && session === null && !canShowWallet(session)) {
      go("");
      setAuth("signin");
    }
  }, [route, session]);

  const blocked = status?.blocked ?? false;
  let page;
  if (blocked) page = null;
  else if (route === "wallet" && canShowWallet(session)) page = <Dashboard me={session!} onSignOut={signOut} />;
  else if (route === "privacy" || route === "voorwaarden" || route === "beveiliging")
    page = (
      <main className="landing">
        <header className="landing-nav">
          <a href="#/" className="brand-lockup"><Mark small /><span>KERN</span></a>
        </header>
        <section className="legal">
          <a className="text-button legal-back" href="#/"><ArrowLeft size={15} /> {translate(lang, "back")}</a>
          {route === "privacy" && <Privacy />}
          {route === "voorwaarden" && <Voorwaarden />}
          {route === "beveiliging" && <Beveiliging />}
        </section>
      </main>
    );
  else page = <Landing onOpenWallet={openWallet} onCreate={create} />;

  return (
    <I18nProvider lang={lang} setLang={setLang}>
      {blocked && (
        <div className="banner banner-danger" role="alert">
          <strong>{translate(lang, "blocked.title")}</strong> {status?.message || translate(lang, "blocked.text")}
        </div>
      )}
      {page}
      {notice && (
        <div className="toast" role="status">
          {notice} <button className="text-button light" onClick={() => setNotice(null)}>{translate(lang, "close")}</button>
        </div>
      )}
      {auth && !blocked && (
        <AuthDialog
          mode={auth}
          onClose={() => setAuth(null)}
          onSignedIn={() => {
            setAuth(null);
            void refresh().then(() => go("wallet"));
          }}
        />
      )}
    </I18nProvider>
  );
}
