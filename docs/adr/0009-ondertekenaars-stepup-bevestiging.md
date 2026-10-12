# ADR-0009: Ondertekenaars per kluis, step-up en bevestiging van nieuwe leden

- **Status:** Aangenomen · 2026-10-12 · aanleiding: onafhankelijke review ([docs/qa/2026-10-12-backend.md](../qa/2026-10-12-backend.md))
- **Context:** de eerste versie haalde goedkeuringsrechten uit organisatierollen. Gevolgen:
  - een solo-ondernemer met een 2-van-3-kluis kon nooit iets goedgekeurd krijgen;
  - stemmen van verwijderde leden bleven tellen;
  - een eigenaar kon met nep-accounts een quorum faken;
  - een onderschepte uitnodigingscode gaf eigenaarschap.
- **Besluit:**
  1. **`vault_signers`**: per sleutel (descriptor-positie) wie hem houdt. Eén persoon kan meerdere sleutels houden. Goedkeuringen **wegen naar aantal sleutels**. Alleen stemmen van ondertekenaars die nú actief lid zijn met rol eigenaar of goedkeurder tellen. Na elke lidmaatschaps- of rolwijziging worden openstaande voorstellen herberekend. Goedgekeurd ⇔ gewicht ≥ drempel; afgewezen ⇔ de drempel is onhaalbaar geworden. Een goedkeuring kan nooit tot afwijzing leiden.
  2. **Ondertekenaars zijn vast per kluis** (de on-chain descriptor is ook vast). Een nieuw lid, ook een nep-account, kan dus nooit meestemmen over een bestaande kluis.
  3. **Step-up**: elke gevoelige actie vereist een verse passkey-bevestiging die gebonden is aan precies die gebruiker en dat *target*, bijvoorbeeld `proposal:<id>:approve`. Dat geldt voor beslissen, annuleren, uitnodigen, uitnodiging intrekken, bevestigen, rol wijzigen, verwijderen, kluis aanmaken, sleutels inpakken, encryptiesleutel registreren en een passkey intrekken. Een gestolen sessiecookie is niet genoeg.
  4. **Uitnodigingen** geven nooit eigenaarschap (database-constraint). Ze zijn intrekbaar. Na acceptatie is het lid **pending** tot een eigenaar bevestigt, nadat beide partijen buiten de app een **6-cijferige veiligheidscode** hebben vergeleken.
  5. **Kloondetectie** ná verificatie van de handtekening (alleen authentieke regressies worden gelogd), en een atomaire teller-update (`WHERE counter = oud`) tegen replay bij gelijktijdige verzoeken.
6. **Stemmen van verwijderde leden** op openstaande voorstellen worden gewist; ze herleven niet bij een heruitnodiging.
- **Nog open (gepland):**
  - quorum van eigenaren voor eigenaarswijzigingen (nu kan één eigenaar een andere eigenaar degraderen; impact beperkt door punt 2);
  - de passkey-handtekening over de hash van het voorstel controleerbaar maken voor medeondertekenaars (in de client);
  - KMS-ondertekende auditregels met externe verankering.
