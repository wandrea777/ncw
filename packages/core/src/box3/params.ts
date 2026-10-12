/**
 * Box 3-parameters per belastingjaar.
 *
 * ELKE waarde moet herleidbaar zijn tot een bron. `verified: true` mag alleen
 * worden gezet nadat een mens de waarde heeft gecontroleerd op belastingdienst.nl
 * (of de wettekst), met datum in `verifiedOn`. De compliance-check
 * (`npm run compliance:release`) blokkeert een release zolang een jaar dat in de
 * app selecteerbaar is niet geverifieerd is.
 */

export interface Box3Params {
  year: number;
  /** Tarief box 3, als fractie (0.36 = 36%). */
  tarief: number;
  /** Heffingsvrij vermogen per belastingplichtige (EUR). */
  heffingsvrijVermogen: number;
  /** Schuldendrempel per belastingplichtige (EUR). */
  schuldendrempel: number;
  /** Forfaitaire rendementspercentages, als fractie. */
  pct: {
    banktegoeden: number;
    overigeBezittingen: number;
    schulden: number;
  };
  /** Percentages die op het moment van invoeren nog voorlopig waren. */
  voorlopig: Array<keyof Box3Params["pct"]>;
  sources: string[];
  verified: boolean;
  verifiedOn: string | null;
  notes?: string;
}

export const BOX3_PARAMS: Record<number, Box3Params> = {
  2024: {
    year: 2024,
    tarief: 0.36,
    heffingsvrijVermogen: 57_000,
    schuldendrempel: 3_700,
    pct: { banktegoeden: 0.0144, overigeBezittingen: 0.0604, schulden: 0.0261 },
    voorlopig: [],
    sources: [
      "https://www.mkbservicedesk.nl/belastingen/inkomstenbelasting/box-3-tarieven-en-vrijstellingen",
      "https://www.vanlanschotkempen.com/nl-nl/private-banking/inspiratie/beleggen-en-sparen/de-rendementspercentages-in-box-3-voor-2023-2024-en-2025",
    ],
    verified: false,
    verifiedOn: null,
    notes: "Schuldendrempel 2024 niet in secundaire bron bevestigd; controleren bij Belastingdienst.",
  },
  2025: {
    year: 2025,
    tarief: 0.36,
    heffingsvrijVermogen: 57_684,
    schuldendrempel: 3_800,
    pct: { banktegoeden: 0.0137, overigeBezittingen: 0.0588, schulden: 0.027 },
    voorlopig: [],
    sources: [
      "https://www.mkbservicedesk.nl/belastingen/inkomstenbelasting/box-3-tarieven-en-vrijstellingen",
      "https://www.sra.nl/nieuws/004501/2026/01/box-3-percentages-vrijstellingen-en-bedragen-2026",
    ],
    verified: false,
    verifiedOn: null,
  },
  2026: {
    year: 2026,
    tarief: 0.36,
    heffingsvrijVermogen: 59_357,
    schuldendrempel: 3_800,
    pct: { banktegoeden: 0.0128, overigeBezittingen: 0.06, schulden: 0.027 },
    voorlopig: ["banktegoeden", "schulden"],
    sources: [
      "https://www.sra.nl/nieuws/004501/2026/01/box-3-percentages-vrijstellingen-en-bedragen-2026",
      "https://www.rendement.nl/inkomen-uit-sparen-en-beleggen/nieuws/box-3-tarief-blijft-36-in-2026.html",
    ],
    verified: false,
    verifiedOn: null,
    notes: "Lopend jaar: uitkomst is indicatief. Bank- en schuldpercentage definitief begin 2027.",
  },
};

export const SUPPORTED_YEARS = Object.keys(BOX3_PARAMS)
  .map(Number)
  .sort((a, b) => a - b);

export function getParams(year: number): Box3Params {
  const p = BOX3_PARAMS[year];
  if (!p) throw new Error(`Geen box 3-parameters voor ${year}`);
  return p;
}
