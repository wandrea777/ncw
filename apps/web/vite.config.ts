import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };
let commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";
if (commit === "dev") try {
  commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
} catch {
  /* nog geen commit */
}

// Koopknop: een tikfout in VITE_ONRAMP_ENV mag een productie-build niet stil op de testomgeving zetten.
const onrampEnv = process.env.VITE_ONRAMP_ENV;
if (onrampEnv !== undefined && onrampEnv !== "" && onrampEnv !== "demo" && onrampEnv !== "production") {
  throw new Error(`VITE_ONRAMP_ENV moet "demo" of "production" zijn, niet "${onrampEnv}".`);
}

export default defineConfig({
  plugins: [react()],
  // Lokaal: /v1 naar de API (npm run dev:api). Same-origin, zodat de SameSite=Strict-sessiecookie werkt.
  // Vaste poort: de API accepteert alleen deze origin (APP_ORIGIN, CSRF en WebAuthn).
  server: { port: 5188, strictPort: true, proxy: { "/v1": { target: "http://localhost:8787", changeOrigin: false } } },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
  build: {
    sourcemap: false,
    // Geen externe CDN's: alles wordt gebundeld en vanaf eigen domein geserveerd.
    assetsInlineLimit: 0,
  },
});
