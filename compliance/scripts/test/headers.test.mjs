import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { diffHeaders, parseHeadersFile, vercelHeaders } from "../headers.mjs";

const CF = `# commentaar
/*
  Content-Security-Policy: default-src 'self'; connect-src 'self' https://a.example
  X-Frame-Options: DENY

/status.json
  Cache-Control: no-store
`;
const VC = {
  headers: [
    {
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: "default-src 'self'; connect-src 'self' https://a.example" },
        { key: "x-frame-options", value: "DENY" },
      ],
    },
    { source: "/status.json", headers: [{ key: "Cache-Control", value: "no-store" }] },
  ],
};

test("_headers wordt per pad geparseerd, headernamen in kleine letters, commentaar genegeerd", () => {
  assert.deepEqual(parseHeadersFile(CF), {
    "/*": {
      "content-security-policy": "default-src 'self'; connect-src 'self' https://a.example",
      "x-frame-options": "DENY",
    },
    "/status.json": { "cache-control": "no-store" },
  });
});

test("identieke headers op Vercel en Cloudflare geven geen verschillen", () => {
  assert.deepEqual(diffHeaders(parseHeadersFile(CF), vercelHeaders(VC)), []);
});

test("een afwijkende CSP op Vercel wordt gevonden", () => {
  const vc = structuredClone(VC);
  vc.headers[0].headers[0].value = "default-src *";
  assert.deepEqual(diffHeaders(parseHeadersFile(CF), vercelHeaders(vc)), ["/* content-security-policy"]);
});

test("een header die op één host ontbreekt wordt gevonden", () => {
  const vc = structuredClone(VC);
  vc.headers[0].headers.pop();
  assert.deepEqual(diffHeaders(parseHeadersFile(CF), vercelHeaders(vc)), ["/* x-frame-options"]);
});

test("een extra pad op één host wordt gevonden", () => {
  const vc = structuredClone(VC);
  vc.headers.push({ source: "/geheim", headers: [{ key: "X-Test", value: "1" }] });
  assert.deepEqual(diffHeaders(parseHeadersFile(CF), vercelHeaders(vc)), ["/geheim x-test"]);
});

test("zonder CSP faalt de vergelijking, ook als beide hosts gelijk zijn", () => {
  const leeg = "/*\n  X-Frame-Options: DENY\n";
  assert.deepEqual(diffHeaders(parseHeadersFile(leeg), parseHeadersFile(leeg)), ["/* mist content-security-policy"]);
});

test("de echte configuratie in de repo is gelijk", () => {
  const root = new URL("../../../", import.meta.url);
  const cf = parseHeadersFile(readFileSync(new URL("apps/web/public/_headers", root), "utf8"));
  const vc = vercelHeaders(JSON.parse(readFileSync(new URL("vercel.json", root), "utf8")));
  assert.deepEqual(diffHeaders(cf, vc), []);
});

import { lintHeadersFile, lintVercelConfig } from "../headers.mjs";
import { headerRoutes, outputConfig } from "../../../scripts/vercel-output.mjs";

test("lint _headers: verwijderregel, dubbele header, regel zonder dubbele punt en onbekend pad falen", () => {
  const errs = lintHeadersFile("/*\n  ! Content-Security-Policy\n  X-Frame-Options: DENY\n  X-Frame-Options: SAMEORIGIN\n  rommel\n/admin/*\n  X-Test: 1\n");
  assert.equal(errs.length, 4);
  assert.match(errs.join(" "), /verwijderregel/);
  assert.match(errs.join(" "), /dubbele header/);
  assert.match(errs.join(" "), /zonder dubbele punt/);
  assert.match(errs.join(" "), /"\/admin\/\*" niet toegestaan/);
});

test("lint _headers: CSP op een subpad faalt", () => {
  assert.match(lintHeadersFile("/status.json\n  Content-Security-Policy: default-src *\n").join(" "), /CSP alleen op/);
});

test("lint vercel.json: has/missing, routes, rewrites en dubbele bronnen falen", () => {
  const errs = lintVercelConfig({
    routes: [],
    rewrites: [],
    headers: [
      { source: "/(.*)", has: [{ type: "host", value: "x" }], headers: [{ key: "A", value: "1" }] },
      { source: "/(.*)", headers: [{ key: "A", value: "1" }, { key: "a", value: "2" }] },
      { source: "/status.json", headers: [{ key: "Content-Security-Policy", value: "default-src *" }] },
    ],
  });
  for (const re of [/"routes"/, /"rewrites"/, /has\/missing/, /dubbel/, /dubbele header/, /CSP alleen/]) assert.match(errs.join(" "), re);
});

test("de echte vercel.json en _headers zijn schoon", () => {
  const root = new URL("../../../", import.meta.url);
  assert.deepEqual(lintHeadersFile(readFileSync(new URL("apps/web/public/_headers", root), "utf8")), []);
  assert.deepEqual(lintVercelConfig(JSON.parse(readFileSync(new URL("vercel.json", root), "utf8"))), []);
});

test("Build Output-config bevat exact de headers uit vercel.json, met filesystem als laatste", () => {
  const cfg = { headers: VC.headers };
  const out = outputConfig(cfg);
  assert.equal(out.version, 3);
  assert.deepEqual(out.routes.at(-1), { handle: "filesystem" });
  assert.deepEqual(headerRoutes(cfg), [
    { src: "/(.*)", headers: { "Content-Security-Policy": "default-src 'self'; connect-src 'self' https://a.example", "x-frame-options": "DENY" }, continue: true },
    { src: "^/status\\.json$", headers: { "Cache-Control": "no-store" }, continue: true },
  ]);
});
