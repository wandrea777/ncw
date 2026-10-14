#!/usr/bin/env node
/**
 * Automatische compliance-check. Draait bij elke commit (CI), dagelijks (cron) en vóór elke release.
 *
 *   node compliance/scripts/compliance-check.mjs            → ontwikkelmodus: harde fouten falen, rest is waarschuwing
 *   node compliance/scripts/compliance-check.mjs --release  → releasemodus: álle waarschuwingen worden fouten
 *
 * Schrijft een rapport naar compliance/reports/compliance-<datum>.md (onderdeel van de bewijsbundel).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { ROOT, read, exists, walk, loadIncidents, incidentStatus } from "./lib.mjs";
import { diffHeaders, lintHeadersFile, lintVercelConfig, parseHeadersFile, vercelHeaders } from "./headers.mjs";
import { HOT_WALLET_LIBS, NO_DIRECT_LIBS, usesPrivateKeyApi } from "./keyrules.mjs";

const RELEASE = process.argv.includes("--release");
const results = []; // { check, level: "ok"|"warn"|"fail", msg }
const ok = (check, msg) => results.push({ check, level: "ok", msg });
const warn = (check, msg) => results.push({ check, level: RELEASE ? "fail" : "warn", msg });
const fail = (check, msg) => results.push({ check, level: "fail", msg });

const register = parse(read("compliance/register.yaml"));
const checks = {};

// ---------------------------------------------------------------- derde partijen (AVG-1)
checks["derde-partijen"] = () => {
  const codeHosts = new Set();
  for (const f of walk("packages/core/src", (p) => p.endsWith(".ts"))) {
    for (const m of read(f).matchAll(/_HOST\s*=\s*"(https:\/\/[^"]+)"/g)) codeHosts.add(m[1]);
  }
  const headers = read("apps/web/public/_headers");
  const csp = headers.match(/Content-Security-Policy:\s*(.+)/)?.[1] ?? "";
  const connect = csp.match(/connect-src([^;]+)/)?.[1].trim().split(/\s+/).filter((h) => h !== "'self'") ?? [];
  const cspHosts = new Set(connect);
  const privacyHosts = new Set(JSON.parse(read("compliance/third-parties.json")).map((t) => t.host));
  const eq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  if (eq(codeHosts, cspHosts) && eq(cspHosts, privacyHosts)) ok("derde-partijen", `${codeHosts.size} hosts consistent in code, CSP en privacyverklaring`);
  else
    fail(
      "derde-partijen",
      `Mismatch. code=[${[...codeHosts]}] csp=[${[...cspHosts]}] privacy=[${[...privacyHosts]}]. Werk alle drie bij.`,
    );
  for (const d of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "frame-ancestors 'none'"]) {
    if (!csp.includes(d)) fail("derde-partijen", `CSP mist "${d}"`);
  }
};

// ---------------------------------------------------------------- beveiligingsheaders op elke host (CRA-7)
// De web-app kan op Vercel (vercel.json) en Cloudflare Pages (_headers) draaien. Beide moeten exact dezelfde
// headers sturen, anders is de CSP-check hierboven op één van de twee hosts schijnveiligheid.
checks["headers-gelijk"] = () => {
  if (!exists("vercel.json")) return fail("headers-gelijk", "vercel.json ontbreekt");
  const cfText = read("apps/web/public/_headers");
  const vc = JSON.parse(read("vercel.json"));
  const cf = parseHeadersFile(cfText);
  const diffs = [...lintHeadersFile(cfText), ...lintVercelConfig(vc), ...diffHeaders(cf, vercelHeaders(vc))];
  if (vc.git?.deploymentEnabled !== false) diffs.push("vercel.json: Git-deploys moeten uit (git.deploymentEnabled = false); productie en noodstop gaan via de workflows met een geattesteerd artefact");
  if (!/npm run compliance/.test(vc.buildCommand ?? "")) diffs.push("vercel.json: buildCommand moet npm run compliance draaien");
  diffs.length
    ? fail("headers-gelijk", `Probleem in apps/web/public/_headers of vercel.json: ${diffs.join(", ")}`)
    : ok("headers-gelijk", `Vercel en Cloudflare sturen dezelfde ${Object.keys(cf["/*"]).length} beveiligingsheaders`);
};

// ---------------------------------------------------------------- geen trackers (AVG-2)
const TRACKERS = [
  "google-analytics", "googletagmanager", "gtag(", "facebook.net", "connect.facebook", "hotjar", "segment.io",
  "mixpanel", "amplitude.com", "clarity.ms", "doubleclick", "sentry.io", "posthog", "plausible.io", "matomo",
  "@vercel/analytics", "@vercel/speed-insights", "/_vercel/insights", "va.vercel-scripts.com",
];
checks["geen-trackers"] = () => {
  const files = [...walk("apps/web/src"), "apps/web/index.html", ...walk("apps/web/dist", (p) => /\.(js|html)$/.test(p))];
  const hits = files.flatMap((f) => TRACKERS.filter((t) => read(f).includes(t)).map((t) => `${f}: ${t}`));
  if (!exists("apps/web/dist")) warn("geen-trackers", "Geen build gevonden (apps/web/dist); alleen broncode gecontroleerd.");
  hits.length ? fail("geen-trackers", hits.join("; ")) : ok("geen-trackers", "Geen trackers gevonden");
};

// ---------------------------------------------------------------- geen opslag op apparaat (COOK-1)
checks["geen-opslag"] = () => {
  const pats = ["document.cookie", "localStorage", "sessionStorage", "indexedDB"];
  // Eén toegestane plek: functionele opslag van door de gebruiker toegevoegde publieke adressen en de taalkeuze
  // (strikt noodzakelijk, Tw art. 11.7a lid 3 sub b; zie ADR-0013). Alles daarbuiten faalt.
  const ALLOWED_STORAGE = "apps/web/src/lib/storage.ts";
  const hits = [...walk("apps/web/src"), ...walk("packages/core/src")]
    .filter((f) => !f.endsWith(ALLOWED_STORAGE))
    .flatMap((f) => pats.filter((p) => read(f).includes(p)).map((p) => `${f}: ${p}`));
  const allowed = exists(ALLOWED_STORAGE) ? read(ALLOWED_STORAGE) : "";
  if (/document\.cookie|sessionStorage|indexedDB/.test(allowed)) hits.push(`${ALLOWED_STORAGE}: alleen localStorage is toegestaan`);
  hits.length
    ? fail("geen-opslag", `${hits.join("; ")}. Opslag vereist toestemming of een strikt-noodzakelijk-analyse.`)
    : ok("geen-opslag", `Geen cookies; lokale opslag alleen in ${ALLOWED_STORAGE} (gevolgde adressen, taal)`);
};

// ---------------------------------------------------------------- copy-lint (RECL-1)
const VERBODEN = [
  "gegarandeerd", "garantie op rendement", "risicovrij", "zonder risico", "100% veilig", "volledig veilig",
  "passief inkomen", "rijk worden", "gratis geld", "rente op je crypto", "hoog rendement", "beste rendement",
  "veiligste", "onhackbaar", "unhackable", "safest",
];
checks["copy-lint"] = () => {
  const files = [...walk("apps/web/src", (p) => /\.(tsx?|json|html|css)$/.test(p)), "apps/web/index.html"];
  const hits = files.flatMap((f) => {
    const t = read(f).toLowerCase();
    return VERBODEN.filter((w) => t.includes(w)).map((w) => `${f}: "${w}"`);
  });
  hits.length ? fail("copy-lint", hits.join("; ")) : ok("copy-lint", `${files.length} bestanden zonder verboden claims`);
};

// ---------------------------------------------------------------- geen sleutelbibliotheken (MICA-1, WWFT-1)
// Sinds ADR-0015 (versturen met een Ledger) bevat de web-bundle wél bibliotheken die transacties bouwen en publieke
// sleutels afleiden. De strengere control uit ADR-0012: niets in de browser maakt, bewaart of gebruikt privésleutels.
// (1) geen herstelzin- of hot-wallet-bibliotheken, (2) onze eigen code roept geen API's aan die privésleutels maken
// of daarmee ondertekenen, (3) Ledger-code alleen in apps/web/src/lib/ledger.ts.
checks["geen-sleutelbibliotheken"] = () => {
  const deps = shippedDeps(["apps/web", "packages/core"]);
  const libs = HOT_WALLET_LIBS.filter((l) => deps.has(l));
  const direct = ["apps/web", "packages/core"].flatMap((ws) => Object.keys(JSON.parse(read(`${ws}/package.json`)).dependencies ?? {}));
  const directHits = NO_DIRECT_LIBS.filter((l) => direct.includes(l));
  const src = [...walk("apps/web/src"), ...walk("packages/core/src")].filter((f) => /\.(tsx?|js)$/.test(f));
  const apiHits = src.filter((f) => usesPrivateKeyApi(read(f)));
  const ledgerHits = src.filter((f) => /@ledgerhq\//.test(read(f)) && !f.endsWith("apps/web/src/lib/ledger.ts"));
  const problems = [
    ...[...new Set([...libs, ...directHits])].map((l) => `bibliotheek ${l}`),
    ...apiHits.map((f) => `privésleutel-API in ${f}`),
    ...ledgerHits.map((f) => `Ledger-code buiten lib/ledger.ts: ${f}`),
  ];
  problems.length
    ? fail("geen-sleutelbibliotheken", problems.join("; "))
    : ok("geen-sleutelbibliotheken", "Geen herstelzin-/hot-wallet-bibliotheken en geen privésleutel-API's in de browsercode");
};

// MICA-4: tot een onafhankelijke audit alleen testnet (ADR-0012 volgorde, ADR-0015). Een overstap naar mainnet
// moet bewust: deze check, de tests en de ADR veranderen dan mee.
checks["alleen-testnet"] = () => {
  const core = read("packages/core/src/send/bitcoin.ts");
  const web = read("apps/web/src/lib/ledger.ts");
  const problems = [];
  if (!/network: TEST_NETWORK/.test(core) || /network: NETWORK\b/.test(core)) problems.push("transacties niet vast op TEST_NETWORK");
  if (!core.includes('api: "https://mempool.space/testnet4/api"')) problems.push("API niet vast op testnet4");
  if (!core.includes('xpub.startsWith("tpub")')) problems.push("geen weigering van mainnet-sleutels");
  if (!web.includes('if (name !== "Bitcoin Test")')) problems.push('Ledger-app niet vast op "Bitcoin Test"');
  problems.length ? fail("alleen-testnet", problems.join("; ")) : ok("alleen-testnet", "Versturen alleen op Bitcoin testnet4 met de app Bitcoin Test");
};

// ---------------------------------------------------------------- licenties (LIC-1)
const ALLOWED = new Set(["MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "CC0-1.0", "Unlicense", "BlueOak-1.0.0"]);
function shippedDeps(workspaces = ["apps/web", "packages/core", "apps/api"]) {
  const seen = new Map();
  const visit = (name) => {
    if (seen.has(name)) return;
    const pj = join("node_modules", name, "package.json");
    if (!exists(pj)) return;
    const pkg = JSON.parse(read(pj));
    seen.set(name, typeof pkg.license === "string" ? pkg.license : pkg.license?.type ?? "ONBEKEND");
    for (const d of Object.keys(pkg.dependencies ?? {})) visit(d);
  };
  for (const ws of workspaces) {
    for (const d of Object.keys(JSON.parse(read(`${ws}/package.json`)).dependencies ?? {})) visit(d);
  }
  return seen;
}
checks["licenties"] = () => {
  const deps = shippedDeps();
  const bad = [...deps].filter(([n, l]) => !n.startsWith("@ncw/") && !String(l).split(/\s+OR\s+|[()]/).some((x) => ALLOWED.has(x.trim())));
  bad.length ? fail("licenties", bad.map(([n, l]) => `${n} (${l})`).join(", ")) : ok("licenties", `${deps.size} meegeleverde pakketten met toegestane licentie`);
};

// ---------------------------------------------------------------- security.txt (CRA-1)
checks["security-txt"] = () => {
  const p = "apps/web/public/.well-known/security.txt";
  if (!exists(p)) return fail("security-txt", "Ontbreekt");
  const t = read(p);
  if (!/^Contact:\s*\S+/m.test(t)) fail("security-txt", "Geen Contact-regel");
  const exp = Date.parse(t.match(/^Expires:\s*(\S+)/m)?.[1] ?? "");
  const days = (exp - Date.now()) / 86_400_000;
  if (!Number.isFinite(exp)) fail("security-txt", "Geen geldige Expires");
  else if (days < 0) fail("security-txt", "Expires is verstreken");
  else if (days > 366) fail("security-txt", "Expires ligt meer dan een jaar vooruit (RFC 9116)");
  else if (days < 30) warn("security-txt", `Expires verloopt over ${Math.round(days)} dagen: vernieuwen`);
  if (/VOORBEELD/.test(t)) warn("security-txt", "Bevat nog placeholder-domein/e-mail");
  else ok("security-txt", "Geldig");
};

// ---------------------------------------------------------------- noodstop (PLD-3)
checks["noodstop"] = () => {
  if (!exists("apps/web/public/status.json")) return fail("noodstop", "apps/web/public/status.json ontbreekt");
  const s = JSON.parse(read("apps/web/public/status.json"));
  if (typeof s.blocked !== "boolean") return fail("noodstop", "status.json mist boolean 'blocked'");
  if (!read("apps/web/src/App.tsx").includes("/status.json")) return fail("noodstop", "App leest status.json niet");
  // Een actieve noodstop blokkeert nooit een release: uitschakelen is altijd de veilige richting.
  ok("noodstop", s.blocked ? `Aanwezig, staat AAN: "${s.message}"` : "Aanwezig, staat uit");
};

// ---------------------------------------------------------------- box 3-parameters (FIS-1)
checks["box3-parameters"] = async () => {
  const { BOX3_PARAMS } = await import(join(ROOT, "packages/core/src/box3/params.ts"));
  const years = Object.values(BOX3_PARAMS);
  const vorigJaar = new Date().getUTCFullYear() - 1;
  if (!BOX3_PARAMS[vorigJaar]) fail("box3-parameters", `Parameters voor ${vorigJaar} ontbreken (nodig voor de aangifte dit jaar)`);
  for (const p of years) {
    if (!p.sources?.length) fail("box3-parameters", `${p.year}: geen bron`);
    if (!p.verified) warn("box3-parameters", `${p.year}: nog niet geverifieerd bij de Belastingdienst`);
    else if (!p.verifiedOn) fail("box3-parameters", `${p.year}: verified zonder verifiedOn-datum`);
  }
  if (years.every((p) => p.verified)) ok("box3-parameters", `${years.length} jaren geverifieerd`);
};

// ---------------------------------------------------------------- placeholders (CONS-1)
checks["placeholders"] = () => {
  const files = walk("apps/web/src/pages").concat(["apps/web/public/.well-known/security.txt"]);
  const hits = files.filter((f) => /\[[A-Z][A-Z /-]{2,}\]|CONCEPT/.test(read(f)));
  hits.length ? warn("placeholders", `Nog in te vullen: ${hits.join(", ")}`) : ok("placeholders", "Geen placeholders");
};

// ---------------------------------------------------------------- open incidenten (CRA-2)
checks["open-incidenten"] = () => {
  const open = loadIncidents().filter((i) => i.status !== "gesloten");
  let bad = 0;
  for (const inc of open) {
    for (const s of incidentStatus(inc)) {
      if (s.status === "VERLOPEN") (bad++, fail("open-incidenten", `${inc.id} ${s.stap}: termijn verstreken (${s.deadline})`));
      else if (s.status === "open" && s.urenOver < 12) warn("open-incidenten", `${inc.id} ${s.stap}: nog ${s.urenOver.toFixed(1)} uur`);
    }
  }
  if (!bad) ok("open-incidenten", `${open.length} open incident(en), geen termijn verstreken`);
};

// Checks die als CI-stap draaien; hier alleen controleren dat ze geconfigureerd zijn.
const ci = exists(".github/workflows/ci.yml") ? read(".github/workflows/ci.yml") : "";
checks["sbom"] = () => (ci.includes("npm run sbom") ? ok("sbom", "CI genereert SBOM") : fail("sbom", "CI-stap voor SBOM ontbreekt"));
checks["tests"] = () => (ci.includes("npm test") ? ok("tests", "CI draait tests") : fail("tests", "CI-stap voor tests ontbreekt"));
checks["vuln-watch"] = () =>
  exists(".github/workflows/security-watch.yml") ? ok("vuln-watch", "Dagelijkse scan geconfigureerd") : fail("vuln-watch", "security-watch workflow ontbreekt");
checks["bewijsbundel"] = () =>
  exists(".github/workflows/release.yml") && read(".github/workflows/release.yml").includes("bewijs")
    ? ok("bewijsbundel", "Release-workflow bewaart bewijsbundel")
    : fail("bewijsbundel", "Release-workflow met bewijsbundel ontbreekt");

// ---------------------------------------------------------------- register: koppeling en handmatige controls
const now = Date.now();
const gebruikteChecks = new Set();
for (const v of register.verplichtingen) {
  for (const c of v.controls ?? []) {
    if (c.type === "auto") {
      if (!checks[c.check]) fail("register", `${c.id}: onbekende check "${c.check}"`);
      gebruikteChecks.add(c.check);
    } else if (c.type === "handmatig") {
      const last = c.laatstGecontroleerd ? Date.parse(c.laatstGecontroleerd) : NaN;
      if (!Number.isFinite(last)) warn("handmatig", `${c.id} (${v.id}) nog nooit uitgevoerd: ${c.beschrijving}`);
      else if (now - last > c.interval * 86_400_000) warn("handmatig", `${c.id} (${v.id}) verlopen sinds ${c.laatstGecontroleerd}: ${c.beschrijving}`);
    }
  }
}

for (const name of gebruikteChecks) {
  try {
    await checks[name]();
  } catch (e) {
    fail(name, `Check crashte: ${e.message}`);
  }
}

// ---------------------------------------------------------------- rapport
const icon = { ok: "✅", warn: "⚠️ ", fail: "❌" };
const lines = results.map((r) => `${icon[r.level]} [${r.check}] ${r.msg}`);
const fails = results.filter((r) => r.level === "fail").length;
const warns = results.filter((r) => r.level === "warn").length;
const summary = `${RELEASE ? "RELEASE" : "ONTWIKKEL"}-modus: ${fails} fout(en), ${warns} waarschuwing(en), ${results.length - fails - warns} ok`;

console.log(lines.join("\n") + "\n\n" + summary);
mkdirSync(join(ROOT, "compliance/reports"), { recursive: true });
const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "");
writeFileSync(
  join(ROOT, `compliance/reports/compliance-${stamp}.md`),
  `# Compliance-rapport ${new Date().toISOString()}\n\n${summary}\n\n${lines.map((l) => `- ${l}`).join("\n")}\n`,
);
process.exit(fails ? 1 : 0);
