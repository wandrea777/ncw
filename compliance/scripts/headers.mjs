/**
 * Vergelijkt de beveiligingsheaders van Cloudflare Pages (`_headers`) met die van Vercel (`vercel.json`).
 * Beide hosts moeten exact hetzelfde sturen; anders is de CSP-controle op één van de twee schijnveiligheid.
 */

/** Parseert het Cloudflare/Netlify `_headers`-formaat naar { pad: { header (lowercase): waarde } }. */
export function parseHeadersFile(text) {
  const blocks = {};
  let path = null;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      path = line.trim();
      blocks[path] ??= {};
    } else if (path) {
      const i = line.indexOf(":");
      if (i > 0) blocks[path][line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
  }
  return blocks;
}

/** Vercel-bronpatronen die gelijkwaardig zijn aan een `_headers`-pad. */
const VERCEL_TO_CF = { "/(.*)": "/*" };

/** Zet `vercel.json`-headers om naar hetzelfde formaat als parseHeadersFile. */
export function vercelHeaders(config) {
  const out = {};
  for (const h of config.headers ?? []) {
    const path = VERCEL_TO_CF[h.source] ?? h.source;
    out[path] = { ...(out[path] ?? {}) };
    for (const { key, value } of h.headers ?? []) out[path][key.toLowerCase()] = value;
  }
  return out;
}

/** Geeft een lijst met verschillen ("pad header") terug; leeg betekent identiek. */
export function diffHeaders(a, b) {
  const diffs = [];
  for (const path of new Set([...Object.keys(a), ...Object.keys(b)])) {
    for (const key of new Set([...Object.keys(a[path] ?? {}), ...Object.keys(b[path] ?? {})])) {
      if (a[path]?.[key] !== b[path]?.[key]) diffs.push(`${path} ${key}`);
    }
  }
  if (!a["/*"]?.["content-security-policy"]) diffs.push("/* mist content-security-policy");
  return diffs;
}

/** Paden waarvoor headers mogen worden gezet. Een CSP alleen op "/*" (anders kan een subpad hem verzwakken). */
const ALLOWED_PATHS = new Set(["/*", "/status.json"]);

/** Strenge controle van `_headers`: geen verwijderregels, geen dubbele headers, geen onbekende paden. */
export function lintHeadersFile(text) {
  const errors = [];
  let path = null;
  const seen = new Set();
  for (const [i, raw] of text.split("\n").entries()) {
    const line = raw.trimEnd();
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      path = line.trim();
      if (!ALLOWED_PATHS.has(path)) errors.push(`_headers r.${i + 1}: pad "${path}" niet toegestaan`);
      continue;
    }
    const t = line.trim();
    if (t.startsWith("!")) errors.push(`_headers r.${i + 1}: verwijderregel "${t}" niet toegestaan`);
    else if (!t.includes(":")) errors.push(`_headers r.${i + 1}: regel zonder dubbele punt`);
    else {
      const key = `${path} ${t.slice(0, t.indexOf(":")).trim().toLowerCase()}`;
      if (seen.has(key)) errors.push(`_headers r.${i + 1}: dubbele header ${key}`);
      seen.add(key);
      if (key.endsWith(" content-security-policy") && path !== "/*") errors.push(`_headers r.${i + 1}: CSP alleen op /*`);
    }
  }
  return errors;
}

/** Strenge controle van `vercel.json`: alleen bekende sleutels, geen voorwaardelijke of legacy regels. */
export function lintVercelConfig(cfg) {
  const errors = [];
  const allowedTop = new Set(["$schema", "installCommand", "buildCommand", "outputDirectory", "headers", "git"]);
  for (const k of Object.keys(cfg)) if (!allowedTop.has(k)) errors.push(`vercel.json: sleutel "${k}" niet toegestaan (kan headers of routes wijzigen)`);
  const sources = new Set();
  for (const h of cfg.headers ?? []) {
    if (h.has || h.missing) errors.push(`vercel.json: voorwaardelijke regel (has/missing) op ${h.source}`);
    const path = VERCEL_TO_CF[h.source] ?? h.source;
    if (!ALLOWED_PATHS.has(path)) errors.push(`vercel.json: bron "${h.source}" niet toegestaan`);
    if (sources.has(h.source)) errors.push(`vercel.json: bron "${h.source}" dubbel`);
    sources.add(h.source);
    const keys = (h.headers ?? []).map((x) => x.key.toLowerCase());
    if (new Set(keys).size !== keys.length) errors.push(`vercel.json: dubbele header in ${h.source}`);
    if (keys.includes("content-security-policy") && path !== "/*") errors.push(`vercel.json: CSP alleen op /(.*)`);
  }
  return errors;
}
