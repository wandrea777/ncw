/**
 * Box 3-rapport voor je aangifte (premium, ADR-0016): de bedragen per peildatum, de uitkomst, waarschuwingen en alle
 * transacties met hun waarde in euro's. Eén bron (`box3Report`) voor zowel de CSV als de printweergave, zodat die
 * nooit uit elkaar lopen. Draait volledig in de browser; er gaat niets naar de server.
 */
import type { AssetYearResult } from "../crypto/valuation";
import type { Box3Input, Box3Result } from "./calculate";

/** Een bedrag in euro's, een hoeveelheid munten (met het aantal decimalen) of tekst. */
export type ReportValue = { eur: number } | { units: number; decimals: number } | { text: string };

export interface ReportLine {
  section: string;
  label: string;
  value: ReportValue;
}

export interface ReportTransaction {
  symbol: string;
  date: string;
  direction: "in" | "uit";
  units: number;
  decimals: number;
  priceEur: number;
  valueEur: number;
  kind: string;
  address: string;
  txid: string;
}

export interface Box3Report {
  year: number;
  generatedAt: string;
  verified: boolean;
  warnings: string[];
  lines: ReportLine[];
  transactions: ReportTransaction[];
}

const eur = (n: number): ReportValue => ({ eur: n });

export function box3Report(args: { input: Box3Input; result: Box3Result; assets: AssetYearResult[]; generatedAt: Date }): Box3Report {
  const { input, result, assets } = args;
  const y = input.year;
  const lines: ReportLine[] = [];
  for (const a of assets) {
    const s = a.asset.symbol;
    const end = a.indicatief ? "nu (indicatief)" : `1 januari ${y + 1}`;
    lines.push(
      { section: s, label: `Saldo 1 januari ${y}`, value: { units: a.unitsBegin, decimals: a.asset.decimals } },
      { section: s, label: `Koers 1 januari ${y} (EUR)`, value: eur(a.priceBegin) },
      { section: s, label: `Waarde 1 januari ${y} (EUR)`, value: eur(a.valueBegin) },
      { section: s, label: `Saldo ${end}`, value: { units: a.unitsEnd, decimals: a.asset.decimals } },
      { section: s, label: `Koers ${end} (EUR)`, value: eur(a.priceEnd) },
      { section: s, label: `Waarde ${end} (EUR)`, value: eur(a.valueEnd) },
      { section: s, label: "Inbreng (EUR)", value: eur(a.inbreng) },
      { section: s, label: "Onttrekking (EUR)", value: eur(a.onttrekking) },
      { section: s, label: "Opbrengsten (EUR)", value: eur(a.opbrengsten) },
      { section: s, label: "Werkelijk rendement (EUR)", value: eur(a.werkelijkRendement) },
    );
  }
  lines.push(
    { section: "Crypto totaal", label: `Waarde 1 januari ${y} (EUR)`, value: eur(input.cryptoBegin) },
    { section: "Crypto totaal", label: "Werkelijk rendement (EUR)", value: eur(input.cryptoWerkelijkRendement) },
    { section: "Overig", label: `Banktegoeden 1 januari ${y}`, value: eur(input.banktegoedenBegin) },
    { section: "Overig", label: "Ontvangen rente", value: eur(input.ontvangenRente) },
    { section: "Overig", label: `Overige bezittingen 1 januari ${y}`, value: eur(input.overigeBezittingenBegin) },
    { section: "Overig", label: "Werkelijk rendement overige bezittingen", value: eur(input.overigeWerkelijkRendement) },
    { section: "Overig", label: `Schulden 1 januari ${y}`, value: eur(input.schuldenBegin) },
    { section: "Overig", label: "Betaalde rente", value: eur(input.betaaldeRente) },
    { section: "Uitkomst", label: "Rendementsgrondslag", value: eur(result.forfaitair.rendementsgrondslag) },
    { section: "Uitkomst", label: "Forfaitair rendement", value: eur(result.forfaitair.forfaitairRendement) },
    { section: "Uitkomst", label: "Voordeel na heffingsvrij vermogen", value: eur(result.forfaitair.voordeel) },
    { section: "Uitkomst", label: "Belasting forfaitair", value: eur(result.forfaitair.belasting) },
    { section: "Uitkomst", label: "Werkelijk rendement (totaal)", value: eur(result.werkelijk.werkelijkRendement) },
    { section: "Uitkomst", label: "Belasting werkelijk rendement", value: eur(result.werkelijk.belasting) },
    { section: "Uitkomst", label: "Tegenbewijsregeling voordeliger", value: { text: result.owrGunstiger ? "ja" : "nee" } },
    { section: "Uitkomst", label: "Geschatte besparing", value: eur(result.geschatteBesparing) },
  );
  const transactions: ReportTransaction[] = [];
  for (const a of assets) {
    for (const f of [...a.flows].sort((p, q) => p.timestamp - q.timestamp)) {
      transactions.push({
        symbol: a.asset.symbol,
        date: new Date(f.timestamp).toISOString().slice(0, 10),
        direction: f.direction,
        units: Number(f.delta) / 10 ** a.asset.decimals,
        decimals: a.asset.decimals,
        priceEur: f.priceEur,
        valueEur: f.valueEur,
        kind: f.internal ? "interne overboeking" : f.direction === "uit" ? "onttrekking" : (f.classification ?? "inbreng"),
        address: f.address,
        txid: f.id,
      });
    }
  }
  // Dezelfde voorzichtigheid als op het scherm: waarschuwingen per munt, plus lopend jaar en ongeverifieerde tarieven.
  const warnings = assets.flatMap((a) => a.warnings.map((w) => `${a.asset.symbol}: ${w}`));
  if (assets.some((a) => a.indicatief)) warnings.push("Lopend jaar: de uitkomst verandert nog.");
  if (!result.params.verified) warnings.push("De tarieven voor dit jaar zijn nog niet handmatig geverifieerd.");
  return { year: y, generatedAt: args.generatedAt.toISOString().slice(0, 16).replace("T", " "), verified: result.params.verified, warnings, lines, transactions };
}

// ------------------------------------------------------------------ CSV

const SEP = ";";
const EOL = "\r\n";

/** Getal met decimale komma en vaste decimalen (geen duizendtalscheiding: Excel NL leest dat als getal). */
export function csvNumber(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "";
  return n.toFixed(Math.min(decimals, 18)).replace(".", ",");
}

/**
 * Tekstcel. CSV-injectie: een cel die met = + - @ tab of CR begint, kan in Excel als formule worden uitgevoerd;
 * die krijgt een apostrof ervoor. Cellen met scheidingsteken, aanhalingsteken of regeleinde worden gequote.
 */
export function csvText(s: string): string {
  let v = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  if (/[;"\r\n]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

const row = (...cells: string[]) => cells.join(SEP);
const cell = (v: ReportValue) => ("eur" in v ? csvNumber(v.eur) : "units" in v ? csvNumber(v.units, v.decimals) : csvText(v.text));

export function box3ReportCsv(args: Parameters<typeof box3Report>[0]): string {
  const r = box3Report(args);
  const out: string[] = [
    row(csvText("KERN Box 3-overzicht"), String(r.year)),
    row(csvText("Gemaakt op (UTC)"), csvText(r.generatedAt)),
    row(csvText("Let op"), csvText("Rekenhulp op basis van publieke blockchaindata en je eigen invoer, geen belastingadvies. Controleer de bedragen voor je aangifte.")),
    row(csvText("Tarieven geverifieerd"), r.verified ? "ja" : "nee"),
    ...r.warnings.map((w) => row("Waarschuwing", csvText(w))),
    "",
    row("Onderdeel", "Omschrijving", "Waarde"),
    ...r.lines.map((l) => row(csvText(l.section), csvText(l.label), cell(l.value))),
    "",
    row("Munt", "Datum (UTC)", "Richting", "Hoeveelheid", "Koers (EUR)", "Waarde (EUR)", "Soort", "Adres", "Transactie-ID"),
    ...r.transactions.map((t) =>
      row(csvText(t.symbol), csvText(t.date), t.direction, csvNumber(t.units, t.decimals), csvNumber(t.priceEur), csvNumber(t.valueEur), csvText(t.kind), csvText(t.address), csvText(t.txid)),
    ),
  ];
  // BOM: Excel herkent anders de UTF-8 (€, ë) niet.
  return "﻿" + out.join(EOL) + EOL;
}
