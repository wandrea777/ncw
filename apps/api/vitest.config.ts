import { defineConfig } from "vitest/config";

// Scenario's met meerdere organisaties en passkey-registraties duren op PGlite in CI soms > 5 s.
// Een ruimere timeout voorkomt dat juist de autorisatietests (IDOR) wankel worden en worden overgeslagen.
export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 30_000 } });
