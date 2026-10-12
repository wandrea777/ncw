# ADR-0008: Doelgroep: ondernemers met grote crypto-vermogens

- **Status:** Aangenomen · 2026-10-12
- **Context:** de eigenaar richt zich op "de grote spelers": ondernemers die veel geld in crypto hebben, privé of in hun BV/holding.
- **Besluit:** het product wordt een **zakelijke non-custodial multisig-kluis**:
  - meerdere ondertekenaars (bestuurders, vennoten, notaris/back-up);
  - rollen: eigenaar, goedkeurder, alleen-lezen (boekhouder/accountant);
  - goedkeuringsworkflow met een volledig, manipulatiebestendig auditlog;
  - rapportages voor de boekhouding van de BV (Vpb, balanswaardering) en box 3 voor privé (de bestaande rekenhulp).
- **Verdienmodel (groen):** abonnement per organisatie (software), plus doorverwijzing naar partners met een vergunning. Geen fee per transactie. Geen bewaring.
- **Gevolgen:** zwaardere eisen aan beveiliging (doelwit voor gerichte aanvallen, ook fysiek: "$5 wrench attack"), auditbaarheid en continuïteit (wat als een bestuurder overlijdt of vertrekt). Zie `docs/security/threat-model.md` en `docs/product/zakelijk.md`.
