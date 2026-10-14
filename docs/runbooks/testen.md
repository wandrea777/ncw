# Runbook: KERN zelf testen (testaccount)

KERN heeft **geen wachtwoorden**. Een testaccount is dus geen gebruikersnaam met wachtwoord, maar een passkey die je in een paar seconden zelf aanmaakt, op je eigen Mac (Touch ID) of telefoon. Die passkey is aan het domein gebonden: lokaal aan `localhost`, later aan je eigen domein.

## 1. Starten (twee terminals)

```bash
npm install
```
```bash
npm run dev:api
```
```bash
npm run dev
```

Open daarna **http://localhost:5188** in Chrome of Safari. Gebruik niet het voorbeeldvenster van een editor: daarin werken passkeys vaak niet.

De lokale API gebruikt een eigen database in `apps/api/.data/` (PGlite). Wissen = alle lokale testaccounts weg.

## 2. Testaccount maken

1. Klik op **Maak je wallet** en vul een naam in, bijvoorbeeld "Test".
2. Bevestig met Touch ID of de passkey-prompt van je browser.
3. Je bent in je wallet. Uitloggen en weer inloggen gaat met **Open wallet** en dezelfde passkey.

## 3. Testadressen (publiek, niet van jou)

Plak via **Adres toevoegen**:

| Munt | Adres | Waarom |
|---|---|---|
| BTC | `bc1q9smlf9r3n2phajx8q97a85m0zufs7zre42t939` | Klein saldo, ongeveer 200 transacties |
| ETH | `0x14f03A8CacE4D2D6F8d744E2f8C1f9Bf5Accc9d4` | Weinig transacties, stof-bedragen |

Dit zijn adressen van onbekenden op de publieke blockchain. Je ziet hun saldo, maar je kunt er niets mee. **Stuur er nooit geld naartoe.** De ontvangstdialoog waarschuwt daar ook voor.

## 4. Geld toevoegen (koopknop) testen

1. Vraag bij Ramp Network een **partner- of testsleutel** aan (partnerprogramma). Zonder sleutel toont de knop "Nog niet actief".
2. Maak `apps/web/.env.local` op basis van `apps/web/.env.example`:
   ```
   VITE_ONRAMP_PROVIDER=ramp
   VITE_ONRAMP_ENV=demo
   VITE_ONRAMP_KEY=<jouw sleutel>
   ```
3. Herstart `npm run dev`. **Geld toevoegen** opent dan de testomgeving van Ramp, waar geen echt geld wordt afgeschreven.

## 5. Versturen met een Ledger (testnet4)

Er staat geen echt geld op het spel: KERN weigert mainnet-adressen en de Ledger-app "Bitcoin" (ADR-0015, control MICA-4).

1. **Ledger Live** → Instellingen → Experimenteel → **Ontwikkelaarsmodus** aan. Installeer daarna in My Ledger de app **Bitcoin Test** (minimaal 2.1).
2. Sluit Ledger Live af: het mag de USB-verbinding niet bezet houden.
3. Open KERN in **Chrome, Edge of Brave** (WebHID; Safari en Firefox ondersteunen het niet). Ontgrendel je Ledger en open **Bitcoin Test**.
4. **Versturen** → **Verbind je Ledger** → kies je Ledger in de kiezer van de browser.
5. Klap **Testnet-coins ontvangen op deze Ledger** open. Klik op **Toon dit adres op mijn Ledger** en controleer dat het adres op het scherm teken voor teken gelijk is.
6. Vraag testnet4-coins aan bij een faucet (zoek op "testnet4 faucet"). Wacht op één bevestiging; onbevestigde coins worden niet uitgegeven.
7. Open Versturen opnieuw en stuur een klein bedrag (bijv. `0,0001`) terug naar de faucet of naar een tweede eigen adres. Controleer op je Ledger het adres, het bedrag en de vergoeding, en keur goed.
8. De link naar mempool.space/testnet4 toont je transactie.

**Ook testen:**
- weigeren op de Ledger → "Geweigerd op je Ledger. Er is niets verstuurd.";
- de app "Bitcoin" (mainnet) open → aparte melding;
- Ledger vergrendeld → "Je Ledger is vergrendeld";
- een `bc1…`-adres → "Dit is een mainnet-adres";
- een adres dat aan begin en eind lijkt op een eigen adres → waarschuwing.

## 6. Wat je kunt testen

- Registreren, uitloggen, inloggen, en "Uitloggen en dit apparaat wissen".
- Saldo in euro's, de grafiek (1W/1M/1Y/ALL), bezittingen, activiteit.
- Ontvangen (QR), Box 3, beveiligingscentrum (je passkeys), NL/EN, mobiel (maak het venster smal).
- Versturen met een Ledger op testnet4 (§5).
- Een herstelzin plakken bij Adres toevoegen: de app waarschuwt en wist de invoer.
