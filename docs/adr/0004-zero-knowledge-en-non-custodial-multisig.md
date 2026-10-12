# ADR-0004: Zero-knowledge server en non-custodial multisig

- **Status:** Aangenomen (server) · client-side cryptografie: **ontwerp, nog te bouwen en extern te reviewen** · 2026-10-12
- **Context:** de doelgroep heeft grote vermogens. De grootste risico's zijn (1) dat wij gehackt worden, (2) dat wij juridisch als bewaarder (MiCA-vergunning) worden gezien, (3) dat een insider of overheid gegevens opvraagt.
- **Besluit:**
  1. **Multisig met hardware wallets van de klant** (bijv. 2-van-3 bestuurders, of 2-van-3 met een notaris/back-up). Wij hebben **geen** sleutel, ook geen "back-upsleutel" (in tegenstelling tot "collaborative custody"-diensten). Daarmee blijven we buiten de MiCA-bewaringsdefinitie ⚖️.
  2. **Zero-knowledge opslag**: descriptor/xpubs, PSBT's en handtekeningen worden in de client versleuteld (XChaCha20-Poly1305 of AES-256-GCM) met een organisatiesleutel. De server bewaart alleen ciphertext + `{alg, keyId, nonce}`.
  3. **Sleutelverdeling (ontwerp)**: elk lid heeft een X25519-sleutelpaar, bij voorkeur afgeleid via de WebAuthn-PRF-extensie van zijn passkey, anders apparaatgebonden. De organisatiesleutel wordt per lid ingepakt (sealed box). Bij het verwijderen van een lid: sleutelrotatie (nieuwe keyId, herversleutelen).
- **Bewust geaccepteerde metadata:** lidmaatschap, rollen, keten, drempel, tijdstippen en status. Nodig om de workflow af te dwingen.
- **Gevolgen:**
  - De server kan geen bedragen of adressen gebruiken voor beleid (bijv. "boven €100k drie handtekeningen"). Zulk beleid moet on-chain (miniscript/timelocks of een smart account) of in de client worden afgedwongen.
  - Verliest een organisatie al haar passkeys/apparaten, dan kunnen wij de versleutelde metadata niet herstellen. **Het geld blijft wel bereikbaar** via de hardware wallets + de offline descriptor-back-up (verplicht onderdeel van de onboarding).
  - Vóór livegang: review door een externe cryptograaf.
