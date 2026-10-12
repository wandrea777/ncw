const eur = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const num = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 8 });
const pct = new Intl.NumberFormat("nl-NL", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtEur = (n: number) => eur.format(n);
export const fmtNum = (n: number) => num.format(n);
export const fmtPct = (n: number) => pct.format(n);
export const fmtDate = (t: number) => new Date(t).toLocaleDateString("nl-NL", { timeZone: "UTC" });
export const shortAddr = (a: string) => (a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);
