# Product: de kluis voor ondernemers

*Bijgewerkt: 2026-10-12 · zie ADR-0008*

## Voor wie

Ondernemers en families met grote crypto-vermogens (indicatief vanaf ± €250.000):
- **in een BV of holding**: crypto op de balans, meerdere bestuurders, een accountant die moet kunnen controleren;
- **privé**: grote bedragen waar één telefoon of één herstelzin een onacceptabel risico is.

## Het probleem

| Nu | Risico |
|---|---|
| Alles op een exchange | Tegenpartijrisico (faillissement, bevriezing); geen eigen sleutels |
| Eén hardware wallet + herstelzin in een la | Eén persoon, één punt van falen: diefstal, verlies, overlijden, dwang |
| Zelfgebouwde multisig | Foutgevoelig, geen audit trail, geen rollen, boekhouding handmatig |

## Wat wij bieden (non-custodial)

1. **Multisig-kluis** (bijv. 2-van-3): sleutels bij de bestuurders op hardware wallets, plus optioneel een reservesleutel bij een notaris. **Wij hebben geen sleutel.**
2. **Goedkeuringsworkflow**: voorstel → goedkeuring door M personen → ondertekenen op de eigen hardware wallets → uitzenden.
3. **Rollen**: eigenaar, goedkeurder, alleen-lezen (accountant/boekhouder).
4. **Manipulatiebestendig auditlog**: wie deed wat, wanneer. Exporteerbaar voor de accountant.
5. **Rapportage**:
   - BV: transactie- en waarderingsoverzicht voor de jaarrekening en Vpb, export naar boekhoudsoftware;
   - privé: de box 3-rekenhulp (werkelijk rendement / OWR).
6. **Continuïteit**: begeleide inrichting van reservesleutels en een noodplan bij overlijden of vertrek.

## Verdienmodel (alleen groen)

| Pakket | Voor | Indicatie |
|---|---|---|
| Privé | 1 persoon, 1 kluis | € 25–50 / maand |
| Zakelijk | BV, tot 5 leden, onbeperkt kluizen, accountant-toegang | € 100–250 / maand |
| Onboarding | Begeleide inrichting en sleutelceremonie | eenmalig € 500–1.500 |

**Rekensom:** 150 zakelijke klanten × € 150/mnd = **± € 270.000 per jaar** aan softwareomzet, zonder bewaring en zonder transactiefee. Dat is veel haalbaarder dan 100.000 consumenten.

## Juridisch (samengevat; ⚖️ laten toetsen)

- Geen sleutels, geen bewaring, geen ruil of orderdoorgifte → buiten MiCA en Wwft (zie `compliance/register.yaml`).
- Software-abonnement → consumenten- en contractenrecht, AVG, productaansprakelijkheid (software).
- Onboarding of advies over sleutelbeheer is technische dienstverlening, **geen beleggingsadvies**. Nooit adviseren over wát te kopen of verkopen.

## Concurrentie (internationaal)

Casa, Unchained (collaborative custody: houden zelf een sleutel → vergunningsrisico in de EU), Nunchuk, Bitcoin Keeper, Safe{Wallet} (EVM). **Onderscheid:** Nederlands, zakelijk (BV, accountant, Vpb/box 3), zero-knowledge, geen sleutel bij ons.
