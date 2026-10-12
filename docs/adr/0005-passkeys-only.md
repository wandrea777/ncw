# ADR-0005: Alleen passkeys (geen wachtwoorden, geen sms)

- **Status:** Aangenomen · 2026-10-12
- **Context:** phishing en credential stuffing zijn de belangrijkste aanvallen op accounts van vermogende doelwitten. Sms is kwetsbaar voor SIM-swapping.
- **Besluit:** inloggen uitsluitend met **passkeys (WebAuthn)**, met user verification verplicht (biometrie/PIN). Passkeys zijn phishingbestendig: de browser koppelt ze aan ons domein.
  - Sessies: willekeurig token van 256 bit, in de database alleen als SHA-256-hash. Cookie `__Host-ncw_session`, `Secure`, `HttpOnly`, `SameSite=Strict`. Absolute levensduur 12 uur, inactiviteit 30 minuten.
  - Challenges zijn eenmalig en 2 minuten geldig. Een teller die terugloopt wordt geweigerd en gelogd (mogelijke kloon).
  - CSRF: naast SameSite=Strict moet elke wijzigende request de exacte `Origin` van de app hebben.
- **Nog te doen:**
  - meerdere passkeys per gebruiker beheren (toevoegen/intrekken);
  - **step-up**: een verse passkey-bevestiging bij goedkeuren en rolwijzigingen;
  - herstelprocedure via de andere bestuurders (sociaal herstel binnen de organisatie, nooit via ons alleen).
- **Alternatieven:** wachtwoord + TOTP (phishbaar); magic links (e-mail = zwakke schakel); sms (SIM-swap).
