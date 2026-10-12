/**
 * Parseert een door de gebruiker ingevoerd eurobedrag in Nederlandse of internationale notatie.
 * "40.000" = 40000, "1.234,56" = 1234.56, "1234.56" = 1234.56, "-2.500,50" = -2500.5, "" = 0.
 * Ongeldige invoer geeft NaN (de UI toont dan een fout en rekent niet door).
 */
export function parseEur(s: string): number {
  const t = s.trim().replace(/[\s€]/g, "");
  if (!t) return 0;
  let normalized: string;
  if (t.includes(",")) {
    if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(t)) return NaN;
    normalized = t.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    normalized = t.replace(/\./g, ""); // punten als duizendtalscheiding
  } else if (/^-?\d+(\.\d+)?$/.test(t)) {
    normalized = t;
  } else {
    return NaN;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}
