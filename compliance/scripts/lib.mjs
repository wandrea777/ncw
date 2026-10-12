import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const INCIDENT_DIR = join(ROOT, "compliance", "incidents");

export const read = (p) => readFileSync(join(ROOT, p), "utf8");
export const exists = (p) => existsSync(join(ROOT, p));

export function walk(dir, filter = () => true) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const name of readdirSync(abs)) {
    if (name === "node_modules" || name.startsWith(".") && name !== ".well-known") continue;
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walk(rel, filter));
    else if (filter(rel)) out.push(rel);
  }
  return out;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * CRA art. 14: termijnen vanaf het moment dat de fabrikant kennis kreeg van
 *  - een actief misbruikte kwetsbaarheid: early warning 24u, melding 72u, eindrapport ≤ 14 dagen na beschikbare fix;
 *  - een ernstig incident: early warning 24u, melding 72u, eindrapport ≤ 1 maand na de 72u-melding.
 */
export function incidentDeadlines(inc) {
  const aware = Date.parse(inc.bekendSinds);
  const d = {
    earlyWarning: new Date(aware + 24 * HOUR).toISOString(),
    melding: new Date(aware + 72 * HOUR).toISOString(),
    eindrapport: null,
  };
  if (inc.soort === "kwetsbaarheid") {
    if (inc.fixBeschikbaarOp) d.eindrapport = new Date(Date.parse(inc.fixBeschikbaarOp) + 14 * DAY).toISOString();
  } else {
    const base = inc.gemeld?.melding ? Date.parse(inc.gemeld.melding) : aware + 72 * HOUR;
    const end = new Date(base);
    end.setUTCMonth(end.getUTCMonth() + 1);
    d.eindrapport = end.toISOString();
  }
  return d;
}

/** Geeft per stap de status terug: gedaan / open / verlopen, plus resterende uren. */
export function incidentStatus(inc, now = Date.now()) {
  const d = incidentDeadlines(inc);
  return ["earlyWarning", "melding", "eindrapport"].map((stap) => {
    const deadline = d[stap];
    const gedaan = Boolean(inc.gemeld?.[stap]);
    const urenOver = deadline ? (Date.parse(deadline) - now) / HOUR : null;
    let status = gedaan ? "gedaan" : deadline === null ? "wacht-op-fix" : urenOver < 0 ? "VERLOPEN" : "open";
    return { stap, deadline, gedaan, urenOver, status };
  });
}

export function loadIncidents() {
  if (!existsSync(INCIDENT_DIR)) return [];
  return readdirSync(INCIDENT_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(INCIDENT_DIR, f), "utf8")) }));
}
