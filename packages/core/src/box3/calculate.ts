import { getParams, type Box3Params } from "./params";

/**
 * Invoer voor één belastingplichtige zonder fiscale partner.
 * Alle bedragen in EUR. "Begin" = waarde op 1 januari (peildatum).
 */
export interface Box3Input {
  year: number;
  banktegoedenBegin: number;
  /** Overige bezittingen op 1 januari, EXCLUSIEF de crypto die de app zelf waardeert. */
  overigeBezittingenBegin: number;
  /** Waarde op 1 januari van de crypto die de app waardeert. */
  cryptoBegin: number;
  schuldenBegin: number;

  /** Werkelijk rendement: ontvangen rente op banktegoeden. */
  ontvangenRente: number;
  /** Werkelijk rendement op overige (niet-crypto) bezittingen, door gebruiker opgegeven. */
  overigeWerkelijkRendement: number;
  /** Werkelijk rendement op de crypto, berekend door de app. */
  cryptoWerkelijkRendement: number;
  /** Betaalde rente op box 3-schulden (aftrekbaar). */
  betaaldeRente: number;
}

export interface ForfaitairResult {
  rendementsgrondslag: number;
  forfaitairRendement: number;
  effectiefPercentage: number;
  grondslagSparenBeleggen: number;
  /** Voordeel uit sparen en beleggen (na heffingsvrij vermogen). */
  voordeel: number;
  belasting: number;
}

export interface WerkelijkResult {
  werkelijkRendement: number;
  belasting: number;
}

export interface Box3Result {
  params: Box3Params;
  forfaitair: ForfaitairResult;
  werkelijk: WerkelijkResult;
  /** True als het werkelijk rendement lager is dan het forfaitaire voordeel. */
  owrGunstiger: boolean;
  /** Geschat verschil in belasting (forfaitair - werkelijk), nooit negatief. */
  geschatteBesparing: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function berekenForfaitair(input: Box3Input, p: Box3Params = getParams(input.year)): ForfaitairResult {
  const overige = input.overigeBezittingenBegin + input.cryptoBegin;
  const schuldenNaDrempel = Math.max(0, input.schuldenBegin - p.schuldendrempel);
  const rendementsgrondslag = input.banktegoedenBegin + overige - schuldenNaDrempel;

  const forfaitairRendement =
    input.banktegoedenBegin * p.pct.banktegoeden +
    overige * p.pct.overigeBezittingen -
    schuldenNaDrempel * p.pct.schulden;

  if (rendementsgrondslag <= 0) {
    return {
      rendementsgrondslag: round2(rendementsgrondslag),
      forfaitairRendement: round2(forfaitairRendement),
      effectiefPercentage: 0,
      grondslagSparenBeleggen: 0,
      voordeel: 0,
      belasting: 0,
    };
  }

  const effectiefPercentage = forfaitairRendement / rendementsgrondslag;
  const grondslagSparenBeleggen = Math.max(0, rendementsgrondslag - p.heffingsvrijVermogen);
  const voordeel = Math.max(0, grondslagSparenBeleggen * effectiefPercentage);

  return {
    rendementsgrondslag: round2(rendementsgrondslag),
    forfaitairRendement: round2(forfaitairRendement),
    effectiefPercentage,
    grondslagSparenBeleggen: round2(grondslagSparenBeleggen),
    voordeel: round2(voordeel),
    belasting: round2(voordeel * p.tarief),
  };
}

/**
 * Werkelijk rendement volgens de Wet tegenbewijsregeling box 3:
 * direct + indirect rendement (incl. ongerealiseerd), geen kostenaftrek behalve
 * betaalde rente op schulden, en GEEN heffingsvrij vermogen.
 */
export function berekenWerkelijk(input: Box3Input, p: Box3Params = getParams(input.year)): WerkelijkResult {
  const werkelijkRendement =
    input.ontvangenRente + input.overigeWerkelijkRendement + input.cryptoWerkelijkRendement - input.betaaldeRente;
  return {
    werkelijkRendement: round2(werkelijkRendement),
    belasting: round2(Math.max(0, werkelijkRendement) * p.tarief),
  };
}

export function berekenBox3(input: Box3Input): Box3Result {
  const params = getParams(input.year);
  const forfaitair = berekenForfaitair(input, params);
  const werkelijk = berekenWerkelijk(input, params);
  const owrGunstiger = Math.max(0, werkelijk.werkelijkRendement) < forfaitair.voordeel;
  return {
    params,
    forfaitair,
    werkelijk,
    owrGunstiger,
    geschatteBesparing: owrGunstiger ? round2(forfaitair.belasting - werkelijk.belasting) : 0,
  };
}
