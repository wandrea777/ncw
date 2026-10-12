#!/usr/bin/env node
/**
 * Dagelijkse kwetsbaarhedenscan.
 *  1. Leest alle pakketten uit package-lock.json.
 *  2. Vraagt bekende kwetsbaarheden op bij OSV.dev (Google, open data).
 *  3. Vergelijkt de CVE's met de CISA Known Exploited Vulnerabilities-catalogus (= actief misbruikt).
 *
 * Exitcodes: 0 = niets, 1 = kwetsbaarheden gevonden (triage nodig), 2 = ACTIEF MISBRUIKT in meegeleverd pakket.
 * Bij 2 wordt automatisch een CRA-incident aangemaakt zodat de 24-uursklok zichtbaar loopt.
 * Schrijft compliance/reports/vuln-watch.json voor de GitHub-workflow.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { ROOT, read } from "./lib.mjs";

const lock = JSON.parse(read("package-lock.json"));
const pkgs = Object.entries(lock.packages)
  .filter(([path, p]) => path.startsWith("node_modules/") && p.version && !p.link)
  .map(([path, p]) => ({ name: path.split("node_modules/").pop(), version: p.version, dev: Boolean(p.dev) }));

async function post(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

const found = [];
for (let i = 0; i < pkgs.length; i += 500) {
  const batch = pkgs.slice(i, i + 500);
  const res = await post("https://api.osv.dev/v1/querybatch", {
    queries: batch.map((p) => ({ package: { name: p.name, ecosystem: "npm" }, version: p.version })),
  });
  res.results.forEach((r, j) => {
    for (const v of r.vulns ?? []) found.push({ pkg: batch[j], id: v.id });
  });
}

const details = await Promise.all(
  [...new Set(found.map((f) => f.id))].map(async (id) => [id, await (await fetch(`https://api.osv.dev/v1/vulns/${id}`)).json()]),
);
const byId = Object.fromEntries(details);

const kev = await (await fetch("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json")).json();
const kevSet = new Set(kev.vulnerabilities.map((v) => v.cveID));

const report = found.map(({ pkg, id }) => {
  const v = byId[id] ?? {};
  const aliases = [id, ...(v.aliases ?? [])];
  const cves = aliases.filter((a) => a.startsWith("CVE-"));
  return {
    package: `${pkg.name}@${pkg.version}`,
    meegeleverd: !pkg.dev,
    id,
    cves,
    samenvatting: v.summary ?? "",
    ernst: v.database_specific?.severity ?? "ONBEKEND",
    actiefMisbruikt: cves.some((c) => kevSet.has(c)),
  };
});

mkdirSync(join(ROOT, "compliance/reports"), { recursive: true });
writeFileSync(join(ROOT, "compliance/reports/vuln-watch.json"), JSON.stringify({ gescand: pkgs.length, bevindingen: report }, null, 2));

console.log(`${pkgs.length} pakketten gescand, ${report.length} bevinding(en).`);
for (const r of report) console.log(`${r.actiefMisbruikt ? "🚨" : "•"} ${r.package} ${r.id} ${r.ernst} ${r.meegeleverd ? "(meegeleverd)" : "(alleen build)"} ${r.samenvatting}`);

const exploited = report.filter((r) => r.actiefMisbruikt && r.meegeleverd);
if (exploited.length) {
  for (const r of exploited) {
    execFileSync("node", [join(ROOT, "compliance/scripts/incident.mjs"), "nieuw", "--soort", "kwetsbaarheid", "--titel", `${r.package} ${r.cves.join(",")}`, "--bron", "vuln-watch (OSV + CISA KEV)"], { stdio: "inherit" });
  }
  console.log("\n🚨 Actief misbruikte kwetsbaarheid in meegeleverd pakket. CRA-klok loopt: early warning binnen 24 uur als ons product geraakt is.");
  process.exit(2);
}
process.exit(report.length ? 1 : 0);
