#!/usr/bin/env node
/**
 * Rooktest ná elke deploy: haalt de echte headers op van een live URL en vergelijkt ze met vercel.json.
 * Controleert ook een 404, een asset en status.json (de noodstop).
 *
 *   node scripts/smoke-headers.mjs https://<site> [--expect-blocked] [--retries=N]
 *
 * --retries: opnieuw proberen (elke 10 s) tot alles klopt, bijv. na promoveren tot de nieuwe versie live is.
 * Een beschermde preview-URL (Deployment Protection) wordt bereikt met VERCEL_AUTOMATION_BYPASS_SECRET.
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith("--"));
const flag = args.includes("--expect-blocked") ? "--expect-blocked" : undefined;
const retries = Number(args.find((a) => a.startsWith("--retries="))?.split("=")[1] ?? 0);
if (!base?.startsWith("https://") && !base?.startsWith("http://localhost:")) {
  console.error("Gebruik: node scripts/smoke-headers.mjs https://<site> [--expect-blocked]");
  process.exit(2);
}
const cfg = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const expected = Object.fromEntries(cfg.headers.find((h) => h.source === "/(.*)").headers.map((h) => [h.key.toLowerCase(), h.value]));
async function run() {
  const errors = [];
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const fetchOpts = { redirect: "manual", headers: bypass ? { "x-vercel-protection-bypass": bypass } : {} };

  const html = await (await fetch(base + "/", fetchOpts)).text();
  const asset = html.match(/\/assets\/[\w.-]+\.js/)?.[0];
  for (const path of ["/", "/status.json", "/.well-known/security.txt", "/bestaat-niet-" + Date.now(), ...(asset ? [asset] : [])]) {
    const res = await fetch(base + path, fetchOpts);
    if (path.startsWith("/bestaat-niet") && res.status !== 404) errors.push(`${path}: status ${res.status}, verwacht 404`);
    for (const [k, v] of Object.entries(expected)) {
      if (res.headers.get(k) !== v) errors.push(`${path}: ${k} is "${res.headers.get(k)}"`);
    }
    if (path === "/status.json") {
      if (!/no-store/.test(res.headers.get("cache-control") ?? "")) errors.push("/status.json: Cache-Control zonder no-store");
      const s = await res.json().catch(() => null);
      if (typeof s?.blocked !== "boolean") errors.push("/status.json: geen geldige noodstop");
      else if ((flag === "--expect-blocked") !== s.blocked) errors.push(`/status.json: blocked=${s.blocked}, verwacht ${flag === "--expect-blocked"}`);
    }
  }
  if (!asset) errors.push("Geen /assets/*.js gevonden in de HTML");
  return errors;
}

let errors = await run();
for (let i = 0; i < retries && errors.length; i++) {
  await new Promise((r) => setTimeout(r, 10_000));
  errors = await run();
}
if (errors.length) {
  console.error("❌ Rooktest headers:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log(`✅ Rooktest: ${Object.keys(expected).length} headers op alle gecontroleerde paden, noodstop ${flag === "--expect-blocked" ? "aan" : "uit"}.`);
