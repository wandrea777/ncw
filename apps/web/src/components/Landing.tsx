import { useState } from "react";
import { ArrowUpRight, ChevronDown, Fingerprint, Globe2, LockKeyhole, Menu, ShieldCheck, Sparkles, X } from "lucide-react";
import { useI18n } from "../i18n";
import { Mark } from "./Mark";

/** Landingspagina: markup en klassen 1-op-1 uit het v0-ontwerp; teksten via i18n, knoppen gekoppeld aan echte acties. */
export function Landing({ onOpenWallet, onCreate }: { onOpenWallet(): void; onCreate(): void }) {
  const { t, lang, setLang } = useI18n();
  const [mobileMenu, setMobileMenu] = useState(false);
  const toggleLang = () => setLang(lang === "NL" ? "EN" : "NL");
  const go = (id: string) => {
    setMobileMenu(false);
    document.getElementById(id)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <main className="landing">
      <header className="landing-nav">
        <div className="brand-lockup"><Mark small /><span>KERN</span></div>
        <nav className="landing-links">
          <a href="#principles" onClick={(e) => (e.preventDefault(), go("principles"))}>{t("nav.principles")}</a>
          <a href="#security" onClick={(e) => (e.preventDefault(), go("security"))}>{t("nav.security")}</a>
          <a href="#members" onClick={(e) => (e.preventDefault(), go("members"))}>{t("nav.early")}</a>
        </nav>
        <div className="nav-right">
          <button className="language" onClick={toggleLang} title={t("lang.switch")}>{lang} <ChevronDown size={13} /></button>
          <button className="nav-cta" onClick={onOpenWallet}>{t("nav.open")} <ArrowUpRight size={15} /></button>
          <button className="mobile-menu" aria-label={mobileMenu ? t("menu.close") : t("menu.open")} aria-expanded={mobileMenu} onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X /> : <Menu />}</button>
        </div>
      </header>
      {mobileMenu && (
        <nav className="mobile-links">
          <a href="#principles" onClick={(e) => (e.preventDefault(), go("principles"))}>{t("nav.principles")}</a>
          <a href="#security" onClick={(e) => (e.preventDefault(), go("security"))}>{t("nav.security")}</a>
          <a href="#members" onClick={(e) => (e.preventDefault(), go("members"))}>{t("nav.early")}</a>
          <a href="#/wallet" onClick={(e) => (e.preventDefault(), setMobileMenu(false), onOpenWallet())}>{t("nav.open")}</a>
        </nav>
      )}

      <section className="hero">
        <div className="hero-copy">
          <p className="kicker"><span /> {t("hero.kicker")}</p>
          <h1>{t("hero.title1")}<br /><em>{t("hero.title2")}</em></h1>
          <p className="hero-lede">{t("hero.lede")}</p>
          <div className="hero-actions">
            <button className="primary-cta" onClick={onCreate}>{t("hero.create")} <ArrowUpRight size={17} /></button>
            <button className="secondary-cta" onClick={() => go("principles")}>{t("hero.why")} <span>↓</span></button>
          </div>
          <div className="trust-line"><ShieldCheck size={15} /><span>{t("hero.trust")}</span></div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="visual-label">KERN / 01</div>
          <div className="wallet-card">
            <div className="wallet-card-top"><span>KERN</span><span>EUR · MAINNET</span></div>
            <div className="card-balance">€56,497<span>.36</span></div>
            <div className="card-meta"><span>{t("card.example")}</span><span>•••• 8204</span></div>
            <div className="card-mark"><Mark /></div>
          </div>
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <span className="visual-note">{t("card.note")}</span>
        </div>
      </section>

      <section className="ticker">
        <div><span>01</span><strong>{t("ticker.1")}</strong></div>
        <div><span>02</span><strong>{t("ticker.2")}</strong></div>
        <div><span>03</span><strong>{t("ticker.3")}</strong></div>
        <div><span>04</span><strong>{t("ticker.4")}</strong></div>
      </section>

      <section id="principles" className="principles section">
        <div className="section-intro">
          <p className="kicker"><span /> {t("principles.kicker")}</p>
          <h2>{t("principles.title1")}<br /><em>{t("principles.title2")}</em></h2>
        </div>
        <div className="principle-grid">
          <article><span className="number">01</span><LockKeyhole size={22} /><h3>{t("p1.title")}</h3><p>{t("p1.text")}</p></article>
          <article><span className="number">02</span><Fingerprint size={22} /><h3>{t("p2.title")}</h3><p>{t("p2.text")}</p></article>
          <article><span className="number">03</span><Globe2 size={22} /><h3>{t("p3.title")}</h3><p>{t("p3.text")}</p></article>
        </div>
      </section>

      <section id="security" className="security-section section">
        <div className="security-visual" aria-hidden="true">
          <div className="security-ring"><ShieldCheck size={28} /></div>
          <span className="ring-label ring-label-top">{t("ring.1")}</span>
          <span className="ring-label ring-label-right">{t("ring.2")}</span>
          <span className="ring-label ring-label-bottom">{t("ring.3")}</span>
        </div>
        <div className="security-copy">
          <p className="kicker"><span /> {t("sec.kicker")}</p>
          <h2>{t("sec.title1")}<br /><em>{t("sec.title2")}</em></h2>
          <p>{t("sec.text")}</p>
          <a className="text-button light" href="#/beveiliging">{t("sec.cta")} <ArrowUpRight size={15} /></a>
        </div>
      </section>

      <section id="members" className="members section">
        <div>
          <p className="kicker"><span /> {t("early.kicker")}</p>
          <h2>{t("early.title1")}<br /><em>{t("early.title2")}</em></h2>
        </div>
        <div className="members-copy">
          <p>{t("early.text")}</p>
          <button className="referral referral-button" onClick={onCreate}>
            <div><Sparkles size={18} /><strong>{t("early.row")}</strong></div>
            <span>{t("early.rowNote")}</span>
            <ArrowUpRight size={17} />
          </button>
          <button className="primary-cta" onClick={onCreate}>{t("hero.create")} <ArrowUpRight size={17} /></button>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="brand-lockup"><Mark small /><span>KERN</span></div>
        <span>{t("footer.tagline")}</span>
        <span className="legal-links">
          <a href="#/privacy">{t("footer.privacy")}</a>
          <a href="#/voorwaarden">{t("footer.terms")}</a>
          <a href="#/beveiliging">{t("footer.security")}</a>
          <span>© {new Date().getFullYear()} KERN</span>
        </span>
      </footer>
    </main>
  );
}
