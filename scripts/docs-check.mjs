#!/usr/bin/env node
/**
 * Documentatie-check voor pull requests: als er code is gewijzigd, moet CHANGELOG.md ook gewijzigd zijn.
 * Wijzigingen in de API vereisen een bijgewerkte docs/api/openapi.json.
 * Commits mogen geen AI-assistent als (co-)auteur vermelden.
 * Gebruik: node scripts/docs-check.mjs <base-ref>   (in CI: origin/main)
 */
import { execFileSync } from "node:child_process";

const base = process.argv[2] ?? "origin/main";
const changed = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" }).split("\n").filter(Boolean);
const code = changed.filter((f) => /^(apps|packages)\/.*\.(ts|tsx|sql)$/.test(f) && !f.includes("/test/"));
const errors = [];
if (code.length && !changed.includes("CHANGELOG.md")) errors.push(`Code gewijzigd (${code.length} bestanden) maar CHANGELOG.md niet.`);
if (code.some((f) => f.startsWith("apps/api/src/routes/") || f.startsWith("apps/api/src/lib/schemas")) && !changed.includes("docs/api/openapi.json")) {
  errors.push("API gewijzigd maar docs/api/openapi.json niet opnieuw gegenereerd (npm run openapi -w @ncw/api).");
}
// De eigenaar is de enige auteur: geen AI-assistent als co-auteur in commits.
const messages = execFileSync("git", ["log", "--format=%B", `${base}..HEAD`], { encoding: "utf8" });
if (/co-authored-by:.*(claude|anthropic)|generated with \[?claude/i.test(messages)) errors.push("Een commit vermeldt Claude/Anthropic als (co-)auteur.");
if (errors.length) {
  console.error("❌ Documentatie-check:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log(`✅ Documentatie-check: ${changed.length} gewijzigde bestanden, documentatie bijgewerkt.`);
