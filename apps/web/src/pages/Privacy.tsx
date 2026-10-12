import thirdParties from "../../../../compliance/third-parties.json";

export function Privacy() {
  return (
    <article className="card prose">
      <h1>Privacyverklaring</h1>
      <p className="badge badge-warn">CONCEPT: laten toetsen vóór livegang</p>

      <h2>Kort</h2>
      <ul>
        <li>Wij verzamelen, ontvangen en bewaren <strong>geen</strong> persoonsgegevens. Er is geen account, geen tracking en geen cookies.</li>
        <li>De berekening draait volledig in je browser. Wat je invoert verdwijnt als je de pagina sluit.</li>
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

      <h2>Hosting</h2>
      <p>
        De website wordt geserveerd via [HOSTINGPARTIJ]. Die verwerkt technisch noodzakelijke verbindingsgegevens (zoals je IP-adres)
        om de site te kunnen leveren en te beveiligen. Wij gebruiken geen analytics.
      </p>

      <h2>Je rechten</h2>
      <p>
        Omdat wij geen persoonsgegevens over je opslaan, kunnen we die ook niet inzien, wijzigen of verwijderen. Voor gegevens die de
        partijen hierboven verwerken, kun je je tot hen wenden. Klachten kun je indienen bij de Autoriteit Persoonsgegevens.
      </p>

      <h2>Contact</h2>
      <p>[BEDRIJFSNAAM], KvK [NUMMER], [E-MAIL].</p>
    </article>
  );
}
