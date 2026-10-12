#!/usr/bin/env node
/**
 * CRA-incidentbeheer met automatische termijnbewaking.
 *
 *   npm run incident -- nieuw --soort kwetsbaarheid|incident --titel "..." [--bekend 2026-10-12T20:00:00Z] [--bron "..."]
 *   npm run incident -- status [--binnen 12]   → toont open incidenten + termijnen (exit 1 = verstreken, 3 = binnen N uur)
 *   npm run incident -- gemeld <id> earlyWarning|melding|eindrapport [--op <iso>]
 *   npm run incident -- fix <id> [--op <iso>]  → fix/mitigatie beschikbaar (start eindrapport-termijn bij kwetsbaarheid)
 *   npm run incident -- gebruikers <id>        → gebruikers geïnformeerd
 *   npm run incident -- sluit <id>
 *   npm run incident -- noodstop aan "bericht" | uit
 *
 * Elk incident is een JSON-bestand in compliance/incidents/ en hoort in git (audit trail).
 * Bij `nieuw` worden de meldteksten vooraf ingevuld in compliance/incidents/<id>/.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, INCIDENT_DIR, incidentDeadlines, incidentStatus, loadIncidents } from "./lib.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const save = (inc) => {
  const { file, ...data } = inc;
  writeFileSync(join(INCIDENT_DIR, `${inc.id}.json`), JSON.stringify(data, null, 2) + "\n");
};
const find = (id) => {
  const inc = loadIncidents().find((i) => i.id === id);
  if (!inc) throw new Error(`Incident ${id} niet gevonden`);
  return inc;
};
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" }) : "—");

function renderTemplate(name, inc) {
  const d = incidentDeadlines(inc);
  const t = readFileSync(join(ROOT, "compliance/cra/templates", name), "utf8");
  return t
    .replaceAll("{{id}}", inc.id)
    .replaceAll("{{titel}}", inc.titel)
    .replaceAll("{{soort}}", inc.soort)
    .replaceAll("{{bekendSinds}}", inc.bekendSinds)
    .replaceAll("{{bron}}", inc.bron ?? "")
    .replaceAll("{{deadlineEarlyWarning}}", d.earlyWarning)
    .replaceAll("{{deadlineMelding}}", d.melding)
    .replaceAll("{{product}}", "NCW Box 3-rekenhulp (web)")
    .replaceAll("{{versie}}", JSON.parse(readFileSync(join(ROOT, "apps/web/package.json"), "utf8")).version);
}

switch (cmd) {
  case "nieuw": {
    const soort = flag("soort");
    if (!["kwetsbaarheid", "incident"].includes(soort)) throw new Error("--soort moet kwetsbaarheid of incident zijn");
    const titel = flag("titel") ?? "Zonder titel";
    const bekendSinds = new Date(flag("bekend") ?? Date.now()).toISOString();
    const id = `INC-${bekendSinds.slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6)}`;
    const inc = {
      id,
      titel,
      soort,
      bekendSinds,
      bron: flag("bron") ?? null,
      actiefMisbruikt: soort === "kwetsbaarheid" ? null : undefined,
      status: "open",
      fixBeschikbaarOp: null,
      gebruikersGeinformeerdOp: null,
      gemeld: { earlyWarning: null, melding: null, eindrapport: null },
      logboek: [{ op: new Date().toISOString(), actie: "aangemaakt" }],
    };
    mkdirSync(join(INCIDENT_DIR, id), { recursive: true });
    for (const t of ["early-warning.md", "melding-72u.md", "eindrapport.md", "gebruikersbericht.md"]) {
      writeFileSync(join(INCIDENT_DIR, id, t), renderTemplate(t, inc));
    }
    save(inc);
    console.log(`Aangemaakt: ${id}\n  Early warning vóór: ${fmt(incidentDeadlines(inc).earlyWarning)}\n  Melding vóór:       ${fmt(incidentDeadlines(inc).melding)}`);
    console.log(`  Concept-teksten: compliance/incidents/${id}/\n  Overweeg: npm run incident -- noodstop aan "..."`);
    break;
  }
  case "status": {
    const open = loadIncidents().filter((i) => i.status !== "gesloten");
    let overdue = false;
    if (!open.length) console.log("Geen open incidenten.");
    for (const inc of open) {
      console.log(`\n${inc.id} · ${inc.soort} · ${inc.titel}\n  bekend sinds ${fmt(inc.bekendSinds)}`);
      for (const s of incidentStatus(inc)) {
        if (s.status === "VERLOPEN") overdue = true;
        const rest = s.urenOver !== null && !s.gedaan ? ` (${s.urenOver.toFixed(1)} uur)` : "";
        console.log(`  ${s.status.padEnd(12)} ${s.stap.padEnd(13)} deadline ${fmt(s.deadline)}${rest}`);
      }
      console.log(`  gebruikers geïnformeerd: ${inc.gebruikersGeinformeerdOp ? fmt(inc.gebruikersGeinformeerdOp) : "NEE"}`);
    }
    const binnen = Number(flag("binnen") ?? NaN);
    const soon = open.some((inc) => incidentStatus(inc).some((s) => s.status === "open" && s.urenOver < binnen));
    process.exit(overdue ? 1 : soon ? 3 : 0);
  }
  case "gemeld": {
    const [id, stap] = rest;
    if (!["earlyWarning", "melding", "eindrapport"].includes(stap)) throw new Error("stap: earlyWarning|melding|eindrapport");
    const inc = find(id);
    inc.gemeld[stap] = new Date(flag("op") ?? Date.now()).toISOString();
    inc.logboek.push({ op: new Date().toISOString(), actie: `gemeld: ${stap}` });
    save(inc);
    console.log(`${id}: ${stap} geregistreerd.`);
    break;
  }
  case "fix": {
    const inc = find(rest[0]);
    inc.fixBeschikbaarOp = new Date(flag("op") ?? Date.now()).toISOString();
    inc.logboek.push({ op: new Date().toISOString(), actie: "fix beschikbaar" });
    save(inc);
    console.log(`${inc.id}: fix geregistreerd. Eindrapport vóór ${fmt(incidentDeadlines(inc).eindrapport)}.`);
    break;
  }
  case "gebruikers": {
    const inc = find(rest[0]);
    inc.gebruikersGeinformeerdOp = new Date().toISOString();
    inc.logboek.push({ op: inc.gebruikersGeinformeerdOp, actie: "gebruikers geïnformeerd" });
    save(inc);
    break;
  }
  case "sluit": {
    const inc = find(rest[0]);
    const open = incidentStatus(inc).filter((s) => !s.gedaan && s.deadline);
    if (open.length && !rest.includes("--forceer")) {
      throw new Error(`Nog niet alle meldingen gedaan (${open.map((s) => s.stap).join(", ")}). Gebruik --forceer als melden niet nodig bleek, en leg uit waarom in het logboek.`);
    }
    inc.status = "gesloten";
    inc.logboek.push({ op: new Date().toISOString(), actie: "gesloten" });
    save(inc);
    break;
  }
  case "noodstop": {
    const [stand, ...msg] = rest;
    const path = join(ROOT, "apps/web/public/status.json");
    writeFileSync(path, JSON.stringify({ blocked: stand === "aan", message: stand === "aan" ? msg.join(" ") : "" }) + "\n");
    console.log(`Noodstop ${stand}. Deploy nu (git commit + push naar main) om het live te zetten.`);
    break;
  }
  default:
    console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0]);
}
