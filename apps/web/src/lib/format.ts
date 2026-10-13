const eur = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const num = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 8 });
const pct = new Intl.NumberFormat("nl-NL", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtEur = (n: number) => eur.format(n);
export const fmtNum = (n: number) => num.format(n);
export const fmtPct = (n: number) => pct.format(n);
export const fmtDate = (t: number) => new Date(t).toLocaleDateString("nl-NL", { timeZone: "UTC" });
export const shortAddr = (a: string) => (a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);

/** Opmaak voor het dashboard, afhankelijk van de taal (nl-NL of en-GB). */
export const formatEur = (n: number, locale: string) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(n);

/** "€56.497" en ",36": het v0-ontwerp toont de centen kleiner. */
export function splitEur(n: number, locale: string): [string, string] {
  const parts = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).formatToParts(n);
  const i = parts.findIndex((p) => p.type === "decimal");
  if (i < 0) return [parts.map((p) => p.value).join(""), ""];
  return [parts.slice(0, i).map((p) => p.value).join(""), parts.slice(i).map((p) => p.value).join("")];
}

export const formatPct = (f: number, locale: string) =>
  (f >= 0 ? "+" : "") + new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(f);

/** Bedrag in BTC/ETH. Heel kleine bedragen (stof) met 3 significante cijfers in plaats van "0". */
export function formatAmount(n: number, symbol: "BTC" | "ETH", locale: string): string {
  const digits = symbol === "BTC" ? 8 : 6;
  const tiny = n !== 0 && Math.abs(n) < 10 ** -digits;
  const f = new Intl.NumberFormat(locale, tiny ? { maximumSignificantDigits: 3 } : { maximumFractionDigits: digits });
  return `${f.format(n)} ${symbol}`;
}
