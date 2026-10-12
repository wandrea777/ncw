import { useEffect, useState } from "react";
import { Tool } from "./pages/Tool";
import { Privacy } from "./pages/Privacy";
import { Voorwaarden } from "./pages/Voorwaarden";
import { Beveiliging } from "./pages/Beveiliging";

type Route = "" | "privacy" | "voorwaarden" | "beveiliging";

function currentRoute(): Route {
  const r = window.location.hash.replace(/^#\/?/, "");
  return (["privacy", "voorwaarden", "beveiliging"] as const).includes(r as never) ? (r as Route) : "";
}

interface Status {
  blocked: boolean;
  message: string;
}

/** Noodstop: /status.json kan de tool direct uitschakelen bij een incident, zonder nieuwe release. */
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
  const status = useStatus();

  useEffect(() => {
    const onHash = () => {
      setRoute(currentRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="shell">
      <header className="topbar">
        <a href="#/" className="brand">
          NCW <span className="brand-sub">Box 3-rekenhulp voor crypto</span>
        </a>
      </header>

      {status?.blocked && (
        <div className="banner banner-danger" role="alert">
          <strong>Tijdelijk uitgeschakeld.</strong> {status.message || "We onderzoeken een probleem. Probeer het later opnieuw."}
        </div>
      )}

      <main>
        {route === "" && <Tool disabled={status?.blocked ?? false} />}
        {route === "privacy" && <Privacy />}
        {route === "voorwaarden" && <Voorwaarden />}
        {route === "beveiliging" && <Beveiliging />}
      </main>

      <footer className="footer">
        <p>
          Rekenhulp, geen belastingadvies. Controleer de uitkomst altijd zelf of met een belastingadviseur voordat je
          aangifte doet of bezwaar maakt.
        </p>
        <nav>
          <a href="#/">Rekenhulp</a>
          <a href="#/privacy">Privacy</a>
          <a href="#/voorwaarden">Voorwaarden</a>
          <a href="#/beveiliging">Beveiliging</a>
        </nav>
        <p className="muted">
          Versie {__APP_VERSION__} ({__APP_COMMIT__})
        </p>
      </footer>
    </div>
  );
}
