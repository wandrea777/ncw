export function Beveiliging() {
  return (
    <article className="card prose">
      <h1>Beveiliging en kwetsbaarheden melden</h1>

      <p className="badge badge-warn">CONCEPT: het meldadres wordt ingevuld vóór livegang</p>

      <h2>Hoe KERN is beveiligd</h2>
      <ul>
        <li>
          <strong>Geen sleutels op het web.</strong> Op mainnet is de web-wallet alleen-lezen: je volgt publieke adressen.
          Versturen kan alleen op het testnetwerk, met een Ledger: de sleutel blijft op het apparaat en je keurt elke
          transactie goed op het scherm van de Ledger. KERN vraagt, ontvangt en bewaart nooit een herstelzin of privésleutel. Plakt iemand er per ongeluk een in, dan waarschuwt de app
          en wordt de invoer gewist.
        </li>
        <li>
          <strong>Inloggen met een passkey.</strong> Geen wachtwoord en geen sms. Een passkey is gekoppeld aan ons domein en
          daardoor bestand tegen phishing. Je passkey geeft toegang tot je account, nooit tot je geld.
        </li>
        <li>
          <strong>Je adressen blijven op je apparaat.</strong> Onze server kent alleen je naam, je passkeys en je sessies. De
          adressen die je volgt staan alleen in je browser; met "Uitloggen en dit apparaat wissen" verwijder je ze.
        </li>
        <li>
          Saldi en koersen haalt je browser rechtstreeks op bij de partijen in de privacyverklaring. Een strikt
          beveiligingsbeleid in de browser (Content-Security-Policy) staat geen andere verbindingen toe.
        </li>
        <li>Alle code wordt bij elke wijziging automatisch getest en gescand op bekende kwetsbaarheden.</li>
        <li>Bij een ernstig probleem kunnen we de app direct uitschakelen (noodstop).</li>
      </ul>

      <h2>Kwetsbaarheden melden (Coordinated Vulnerability Disclosure)</h2>
      <p>
        Heb je een kwetsbaarheid gevonden? Meld het ons via <strong>[security@DOMEIN]</strong>, zie ook{" "}
        <a href="/.well-known/security.txt">security.txt</a>. Wij vragen je:
      </p>
      <ul>
        <li>de kwetsbaarheid niet te misbruiken en geen gegevens van anderen in te zien of te wijzigen;</li>
        <li>de kwetsbaarheid niet openbaar te maken voordat we die hebben opgelost (uiterlijk 90 dagen na melding);</li>
        <li>voldoende informatie te geven om het probleem te reproduceren.</li>
      </ul>
      <p>Wij beloven:</p>
      <ul>
        <li>binnen 2 werkdagen te reageren;</li>
        <li>je op de hoogte te houden van de voortgang;</li>
        <li>geen juridische stappen te ondernemen als je je aan dit beleid houdt;</li>
        <li>je, als je dat wilt, te vermelden als melder.</li>
      </ul>
      <p className="muted small">
        Wordt een kwetsbaarheid actief misbruikt, dan melden we dit volgens de Europese Cyber Resilience Act binnen 24 uur bij de
        bevoegde autoriteiten en informeren we gebruikers.
      </p>
    </article>
  );
}
