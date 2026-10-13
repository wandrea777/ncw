#!/usr/bin/env node
/**
 * Bouwt een Vercel Build Output (v3) uit een kant-en-klare site-map, met exact de headers uit vercel.json.
 * Zo deployen release en noodstop precies het artefact uit de bewijsbundel (geen nieuwe build op Vercel).
 *
 *   node scripts/vercel-output.mjs <site-map> [uitvoer-root]   → <uitvoer-root>/.vercel/output
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Zet de `headers` uit vercel.json om naar Build Output-routes (bron-regex, headers, doorgaan). */
export function headerRoutes(vercelConfig) {
  return (vercelConfig.headers ?? []).map((h) => ({
    src: h.source === "/(.*)" ? "/(.*)" : `^${h.source.replace(/[.]/g, "\\.")}$`,
    headers: Object.fromEntries(h.headers.map(({ key, value }) => [key, value])),
    continue: true,
  }));
}

export function outputConfig(vercelConfig) {
  return { version: 3, routes: [...headerRoutes(vercelConfig), { handle: "filesystem" }] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [site, root = "."] = process.argv.slice(2);
  if (!site) {
    console.error("Gebruik: node scripts/vercel-output.mjs <site-map> [uitvoer-root]");
    process.exit(2);
  }
  const cfg = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const out = resolve(root, ".vercel/output");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(resolve(site), join(out, "static"), { recursive: true });
  rmSync(join(out, "static/_headers"), { force: true }); // Cloudflare-formaat, niet publiek op Vercel
  writeFileSync(join(out, "config.json"), JSON.stringify(outputConfig(cfg), null, 2));
  console.log(`Build Output klaar in ${out}`);
}
