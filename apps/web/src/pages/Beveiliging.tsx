export function Beveiliging() {
  return (
    <article className="card prose">
      <h1>Beveiliging en kwetsbaarheden melden</h1>

      <h2>Hoe de rekenhulp is beveiligd</h2>
      <ul>
        <li>Je voert alleen publieke adressen in. Vul nooit je herstelzin of privésleutel in, nergens.</li>
        <li>Alles draait in je browser. Er is geen server die jouw gegevens ontvangt.</li>
        <li>Een strikte Content-Security-Policy bepaalt met welke partijen de browser mag praten (zie de privacyverklaring).</li>
        <li>Alle code wordt bij elke wijziging automatisch getest en gescand op bekende kwetsbaarheden.</li>
        <li>Bij een ernstig probleem kunnen we de rekenhulp direct uitschakelen.</li>
      </ul>

      <h2>Coordinated Vulnerability Disclosure</h2>
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
