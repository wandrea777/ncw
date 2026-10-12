# ADR-0006: Auditlog als hash-keten

- **Status:** Aangenomen · 2026-10-12
- **Context:** bestuurders, accountants en eventueel de rechter moeten kunnen vertrouwen op "wie heeft wat wanneer goedgekeurd". Dat is ook bewijs bij productaansprakelijkheid.
- **Besluit:**
  - Per organisatie een hash-keten: elke regel bevat de SHA-256 van zijn eigen inhoud + de hash van de vorige regel.
  - De auditregel wordt in **dezelfde transactie** geschreven als de actie. Er bestaat geen actie zonder log.
  - Triggers weigeren `UPDATE` en `DELETE` op `audit_log`.
  - Het endpoint `/v1/orgs/{id}/audit` herberekent de keten en meldt of hij intact is.
  - Details bevatten nooit ciphertext of geheimen.
- **Beperking (eerlijk):** wie volledige schrijftoegang tot de database heeft, kan triggers uitschakelen en de *hele* keten herberekenen. Detectie werkt dan alleen tegen een externe referentie.
- **Vervolg:** periodiek de laatste hash **verankeren** buiten onze controle. Bijvoorbeeld (a) de laatste hash per organisatie tonen en laten bewaren door de klant, (b) dagelijks een Merkle-root publiceren of on-chain timestampen (OpenTimestamps).
