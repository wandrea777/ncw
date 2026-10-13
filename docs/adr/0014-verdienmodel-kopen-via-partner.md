# ADR-0014: Verdienen aan kopen via een partner met MiCA-vergunning (en waar Stripe wél past)

- **Status:** Aangenomen (techniek en verdienmodel: alleen omzetdeling, geen opslag) · juridische toets vóór activeren (⚖️, control MICA-2 en MICA-3) · 2026-10-14
- **Context:** de eigenaar wil een iDEAL/Wero-knop om geld te verdienen, "misschien een Stripe-connectie met een percentage", zonder vergunningplicht. PLAN.md §3 noemt doorverwijzing naar een partner met vergunning als groen verdienmodel #1. CLAUDE.md verbiedt een eigen fee in transacties.

## Waarom niet "Stripe met een percentage"

| Opzet | Wat er juridisch gebeurt | Oordeel |
|---|---|---|
| KERN ontvangt euro's via Stripe (iDEAL/Wero) en levert crypto | KERN wisselt geld tegen crypto: een **cryptodienst** (MiCA art. 3 lid 1 sub 16, "wisselen van crypto-activa tegen geld"). Vergunning plus €125.000 eigen vermogen nodig, en de Wwft/AMLR geldt | ❌ |
| Stripe Connect: de gebruiker betaalt een partij, KERN houdt via Connect een percentage in | Het geld loopt via een account van KERN, en KERN verdient per transactie in de keten | ❌ (CLAUDE.md: geen eigen fee in transacties; MiCA-risico) |
| De Crypto Onramp van Stripe als partner | Stripe is dan de partij. Volgens de bronnen alleen kaart en wallets in de EU (geen iDEAL), en geen gedocumenteerde omzetdeling | ⏸ alternatief, niet gekozen |
| **Stripe voor ons eigen softwareabonnement** (Premium Box 3/OWR, B2B-licentie) | Gewone verkoop van software; Stripe is de betaaldienst | ✅ groen (PLAN.md §3 #2), volgende stap |

## Besluit

1. **"Geld toevoegen" = doorverwijzen naar een partner met een MiCA-vergunning** voor "wisselen van crypto tegen geld". Op 2026-10-14 gevonden:

   | Partner | Entiteit | Vergunning | Koppeling |
   |---|---|---|---|
   | **Ramp Network** (standaard) | Ramp Swaps (Ireland) Limited | MiCA-CASP sinds 2 december 2025, EU-breed | Link met vooringevuld adres, zonder server |
   | MoonPay | MoonPay Europe B.V. | AFM-CASP sinds 30 december 2024, plus een EMI-licentie (DNB) | Een vooringevuld adres vraagt een server-handtekening, dus **geen** voorinvulling (zero-knowledge) |

   **iDEAL/Wero:** bij geen van beide is dat officieel bevestigd. De knop noemt pas iDEAL/Wero als de gekozen partner het schriftelijk bevestigt (vragen bij het contract).
2. **Techniek: alleen een link, gemaakt in de browser** (`packages/core/src/onramp`, getest). Hij opent in een nieuw tabblad met `noopener,noreferrer`.
   - De gebruiker rondt de aankoop zelf af bij de partner. KERN geeft **geen orders door** en ontvangt geen betaal- of KYC-gegevens.
   - Onze API ziet niets: geen adres, geen bedrag, geen aankoop.
   - Er gaat geen logo-URL mee; het logo stellen we in via het partnerdashboard. Na afronden stuurt de partner de gebruiker terug naar `/#/wallet`. Dan ziet onze hosting (Vercel) een gewoon paginabezoek; het fragment `#/wallet` komt niet bij de server.
   - Het adres gaat alleen mee als de gebruiker aanvinkt dat hij het zelf beheert. Het volledige adres is dan zichtbaar.
   - Alleen naar bekende partnerhosts.
   - Adres en bedrag worden gevalideerd: een verkeerd adres leidt nooit tot een link.
3. **Verdienen: alleen omzetdeling uit de eigen fee van de partner, met een opslag van 0.**
   - De gebruiker betaalt bij KERN precies hetzelfde als rechtstreeks bij de partner.
   - Een opslag bovenop de transactie, zoals de "Partner Commission" van Ramp, is **uitgesloten**. Die betaalt de gebruiker, en dan is het in feite een eigen fee in de transactie (CLAUDE.md). De tekst "KERN ontvangt een vergoeding van de partner" zou dan ook misleidend zijn (art. 6:193c BW).
   - Dit staat in control MICA-3 en moet in het partnercontract.
   - Biedt een partner alleen een opslag aan, dan wordt de knop niet geactiveerd, of pas na een nieuwe ADR met een expliciet percentage bij de knop en een juridische toets.
   - **Transparant:** de dialoog meldt dat KERN een vergoeding van de partner ontvangt, dat de voorwaarden en kosten van de partner gelden, en dat dit geen beleggingsadvies is.
4. **Activeren** gaat via `VITE_ONRAMP_PROVIDER`, `VITE_ONRAMP_ENV` en `VITE_ONRAMP_KEY` (alleen publieke waarden). Zonder sleutel toont de knop "Nog niet actief".
5. **Volgende stap (apart):** Premium Box 3 via Stripe Checkout (abonnement, server-side webhook, geen kaartgegevens bij KERN).

## Waarom dit buiten de vergunningplicht blijft (inschatting, ⚖️)

- KERN biedt geen cryptodienst: geen bewaring, geen wissel, geen orderdoorgifte, geen advies. De partner is de dienstverlener met vergunning en het contract.
- Geen geld van gebruikers via KERN: Wwft/AMLR geldt niet voor KERN, wel voor de partner.
- MiCA verbiedt marketing van diensten zonder vergunning. Daarom alleen partners die in het register staan, met precies deze dienst (control MICA-3).

## Gevolgen

- Register: control MICA-3 (partnercheck) en RECL-2 (vermelding van de vergoeding). MICA-2 (juridische toets) blijft verplicht vóór activeren in productie.
- De privacyverklaring vermeldt wat er bij een klik naar de partner gaat (munt, bedrag, eventueel het ontvangstadres) en dat KERN daar niets van ontvangt.
- CSP: ongewijzigd. Het is een navigatie naar de partner, geen `connect-src` en geen iframe.
