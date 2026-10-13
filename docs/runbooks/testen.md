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

## 5. Wat je kunt testen

- Registreren, uitloggen, inloggen, en "Uitloggen en dit apparaat wissen".
- Saldo in euro's, de grafiek (1W/1M/1Y/ALL), bezittingen, activiteit.
- Ontvangen (QR), Box 3, beveiligingscentrum (je passkeys), NL/EN, mobiel (maak het venster smal).
- Een herstelzin plakken bij Adres toevoegen: de app waarschuwt en wist de invoer.
