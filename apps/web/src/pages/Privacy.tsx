import thirdParties from "../../../../compliance/third-parties.json";

export function Privacy() {
  return (
    <article className="card prose">
      <h1>Privacyverklaring</h1>
      <p className="badge badge-warn">CONCEPT: laten toetsen vóór livegang</p>

      <h2>Kort</h2>
      <ul>
        <li>
          Voor je account bewaren wij alleen je <strong>naam</strong> (die je zelf kiest), de <strong>publieke sleutels van je
          passkeys</strong> en je <strong>sessies</strong> (met tijdstippen). Geen e-mailadres, geen telefoonnummer, geen
          wachtwoord. Doel: je veilig laten inloggen (uitvoering van de overeenkomst, art. 6 lid 1 sub b AVG). Deze gegevens
          staan in een database binnen de EU [HOSTINGPARTIJ API] (zie ADR-0007).
        </li>
        <li>
          De <strong>adressen die je volgt</strong> bewaren wij niet: ze staan alleen in de opslag van je browser
          (functioneel, op jouw verzoek). Ook je taalkeuze staat daar. Er is geen tracking en er zijn geen
          analytics-cookies. De sessiecookie is strikt noodzakelijk om ingelogd te blijven.
        </li>
        <li>De box 3-berekening draait volledig in je browser. Wat je daar invoert verdwijnt als je de pagina sluit.</li>
        <li>Om publieke blockchaindata en koersen op te halen, maakt je browser rechtstreeks verbinding met de partijen hieronder. Zij zien daarbij je IP-adres en, waar vermeld, het adres dat je opvraagt.</li>
      </ul>

      <h2>Partijen waarmee je browser verbinding maakt</h2>
      <table className="flows">
        <thead>
          <tr>
            <th>Partij</th>
            <th>Doel</th>
            <th>Welke gegevens</th>
            <th>Doorgifte buiten de EER</th>
          </tr>
        </thead>
        <tbody>
          {thirdParties.map((t) => (
            <tr key={t.host}>
              <td>
                {t.partij}
                <br />
                <code>{t.host}</code>
              </td>
              <td>{t.doel}</td>
              <td>{t.gegevens}</td>
              <td>{t.doorgifteBuitenEER}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Deze lijst is technisch afgedwongen: de browser mag via onze Content-Security-Policy met geen enkele andere partij verbinding
        maken. Een geautomatiseerde controle zorgt dat deze lijst en het beleid altijd gelijk zijn.
      </p>

      <h2>Versturen met een Ledger (testnet)</h2>
      <p>
        Verstuur je met een Ledger, dan vraagt je browser aan het apparaat de publieke sleutel van je account. Daarmee berekent de
        browser je adressen en zoekt die op bij mempool.space; zo kan mempool.space zien dat die adressen bij elkaar horen. De
        browser bouwt de transactie, je Ledger ondertekent hem en je browser zendt hem rechtstreeks via mempool.space uit. De
        publieke sleutel, je adressen en de transactie gaan niet naar de KERN-server en worden niet bewaard; ze verdwijnen als je de
        dialoog sluit.
      </p>

      <h2>Kopen via een partner</h2>
      <p>
        Kies je "Geld toevoegen", dan opent de site van een partner met een MiCA-vergunning in een nieuw tabblad. In die link staan
        de munt, het bedrag en (bij Ramp Network, alleen als je aanvinkt dat je het adres zelf beheert) je ontvangstadres. De partner
        is zelf verantwoordelijk voor de verwerking van je gegevens, de identiteitscontrole en de betaling; zie hun
        privacyverklaring. KERN ontvangt geen betaal- of identiteitsgegevens en onze server ziet niet of je iets koopt. Keer je na
        afloop terug naar KERN, dan ziet onze hostingpartij een gewoon paginabezoek. De partner kan ons per doorverwezen aankoop
        een vergoeding betalen uit zijn eigen kosten en ons daarvoor geaggregeerde aantallen tonen.
      </p>

      <h2>Hosting</h2>
      <p>
        De website wordt geserveerd door Vercel Inc. (Verenigde Staten). Vercel verwerkt technisch noodzakelijke verbindingsgegevens
        (zoals je IP-adres) om de site te kunnen leveren en te beveiligen; dat kan buiten de EER gebeuren. Wij gebruiken geen
        analytics, ook niet die van Vercel.
      </p>

      <h2>Abonnement en betalen (Stripe)</h2>
      <p>
        Neem je een abonnement op het Box 3-rapport, dan ga je naar de betaalpagina van Stripe (Stripe Payments Europe Ltd.,
        Ierland). Stripe verwerkt je e-mailadres, betaalgegevens en facturen; zie hun privacyverklaring. Stripe kan gegevens
        doorgeven aan Stripe, Inc. in de Verenigde Staten. KERN stuurt Stripe geen gegevens over jou, ook niet je account-ID:
        we maken een lege Stripe-klant aan en bewaren zelf alleen het Stripe-klantnummer, het abonnementsnummer, de status en de
        einddatum van de periode, gekoppeld aan je account. Geen e-mailadres, naam of betaalgegevens. Het rapport zelf wordt in
        je browser gemaakt; adressen en bedragen gaan niet naar KERN of Stripe. [Rol van Stripe (verwerker of zelfstandig
        verantwoordelijke) per verwerking laten toetsen, AVG-3.]
      </p>

      <h2>Je rechten</h2>
      <p>
        Je kunt je accountgegevens (naam, passkeys, sessies) inzien in het beveiligingscentrum van je wallet. Inzage, correctie
        of verwijdering van je account vraag je aan via het contactadres hieronder; verwijderen vanuit de app zelf komt nog. Voor
        gegevens die de partijen hierboven verwerken, kun je je tot hen wenden. Klachten kun je indienen bij de Autoriteit
        Persoonsgegevens.
      </p>

      <h2>Contact</h2>
      <p>[BEDRIJFSNAAM], KvK [NUMMER], [E-MAIL].</p>
    </article>
  );
}
