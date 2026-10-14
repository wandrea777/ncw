/**
 * Box 3-rapport voor je aangifte (premium, ADR-0016): de bedragen per peildatum, de uitkomst en alle transacties met
 * hun waarde in euro's, als CSV. Draait volledig in de browser; er gaat niets naar de server.
 */
import type { AssetYearResult } from "../crypto/valuation";
import type { Box3Input, Box3Result } from "./calculate";

const SEP = ";";
const EOL = "\r\n";

/** Getal met decimale komma en vaste decimalen (geen duizendtalscheiding: Excel NL leest dat als getal). */
export function csvNumber(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "";
  return n.toFixed(decimals).replace(".", ",");
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

export function box3ReportCsv(args: { input: Box3Input; result: Box3Result; assets: AssetYearResult[]; generatedAt: Date }): string {
  const { input, result, assets } = args;
  const y = input.year;
  const lines: string[] = [
    row(csvText("KERN Box 3-overzicht"), String(y)),
    row(csvText("Gemaakt op (UTC)"), csvText(args.generatedAt.toISOString().slice(0, 16).replace("T", " "))),
    row(csvText("Let op"), csvText("Rekenhulp op basis van publieke blockchaindata en je eigen invoer, geen belastingadvies. Controleer de bedragen voor je aangifte.")),
    row(csvText("Tarieven geverifieerd"), result.params.verified ? "ja" : "nee"),
    "",
    row("Onderdeel", "Omschrijving", "Waarde"),
  ];
  for (const a of assets) {
    const s = a.asset.symbol;
    lines.push(
      row(csvText(s), csvText(`Saldo 1 januari ${y}`), csvNumber(a.unitsBegin, 8)),
      row(csvText(s), csvText(`Koers 1 januari ${y} (EUR)`), csvNumber(a.priceBegin)),
      row(csvText(s), csvText(`Waarde 1 januari ${y} (EUR)`), csvNumber(a.valueBegin)),
      row(csvText(s), csvText(a.indicatief ? "Saldo nu (indicatief)" : `Saldo 1 januari ${y + 1}`), csvNumber(a.unitsEnd, 8)),
      row(csvText(s), csvText(a.indicatief ? "Waarde nu (EUR, indicatief)" : `Waarde 1 januari ${y + 1} (EUR)`), csvNumber(a.valueEnd)),
      row(csvText(s), csvText("Inbreng (EUR)"), csvNumber(a.inbreng)),
      row(csvText(s), csvText("Onttrekking (EUR)"), csvNumber(a.onttrekking)),
      row(csvText(s), csvText("Opbrengsten (EUR)"), csvNumber(a.opbrengsten)),
      row(csvText(s), csvText("Werkelijk rendement (EUR)"), csvNumber(a.werkelijkRendement)),
    );
  }
  lines.push(
    row("Overig", csvText(`Banktegoeden 1 januari ${y}`), csvNumber(input.banktegoedenBegin)),
    row("Overig", csvText("Ontvangen rente"), csvNumber(input.ontvangenRente)),
    row("Overig", csvText(`Overige bezittingen 1 januari ${y}`), csvNumber(input.overigeBezittingenBegin)),
    row("Overig", csvText("Werkelijk rendement overige bezittingen"), csvNumber(input.overigeWerkelijkRendement)),
    row("Overig", csvText(`Schulden 1 januari ${y}`), csvNumber(input.schuldenBegin)),
    row("Overig", csvText("Betaalde rente"), csvNumber(input.betaaldeRente)),
    row("Uitkomst", "Rendementsgrondslag", csvNumber(result.forfaitair.rendementsgrondslag)),
    row("Uitkomst", "Forfaitair rendement", csvNumber(result.forfaitair.forfaitairRendement)),
    row("Uitkomst", csvText("Voordeel na heffingsvrij vermogen"), csvNumber(result.forfaitair.voordeel)),
    row("Uitkomst", "Belasting forfaitair", csvNumber(result.forfaitair.belasting)),
    row("Uitkomst", "Werkelijk rendement (totaal)", csvNumber(result.werkelijk.werkelijkRendement)),
    row("Uitkomst", "Belasting werkelijk rendement", csvNumber(result.werkelijk.belasting)),
    row("Uitkomst", "Tegenbewijsregeling voordeliger", result.owrGunstiger ? "ja" : "nee"),
    row("Uitkomst", "Geschatte besparing", csvNumber(result.geschatteBesparing)),
    "",
    row("Munt", "Datum (UTC)", "Richting", "Hoeveelheid", "Koers (EUR)", "Waarde (EUR)", "Soort", "Adres", "Transactie-ID"),
  );
  for (const a of assets) {
    for (const f of [...a.flows].sort((p, q) => p.timestamp - q.timestamp)) {
      const units = Number(f.delta) / 10 ** a.asset.decimals;
      const soort = f.internal ? "interne overboeking" : f.direction === "uit" ? "onttrekking" : (f.classification ?? "inbreng");
      lines.push(
        row(
          csvText(a.asset.symbol),
          csvText(new Date(f.timestamp).toISOString().slice(0, 10)),
          f.direction,
          csvNumber(units, 8),
          csvNumber(f.priceEur),
          csvNumber(f.valueEur),
          csvText(soort),
          csvText(f.address),
          csvText(f.id),
        ),
      );
    }
  }
  // BOM: Excel herkent anders de UTF-8 (€, ë) niet.
  return "﻿" + lines.join(EOL) + EOL;
}
