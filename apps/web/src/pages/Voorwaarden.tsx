export function Voorwaarden() {
  return (
    <article className="card prose">
      <h1>Gebruiksvoorwaarden</h1>
      <p className="badge badge-warn">CONCEPT: laten toetsen door een jurist vóór livegang</p>

      <h2>1. Wat deze dienst is</h2>
      <p>
        [BEDRIJFSNAAM] (KvK [NUMMER]) biedt een rekenhulp die op basis van publieke blockchaindata, openbare koersdata en jouw eigen
        invoer een indicatie geeft van je box 3-belasting volgens het forfaitaire stelsel en volgens de tegenbewijsregeling.
      </p>

      <h2>2. Wat deze dienst niet is</h2>
      <ul>
        <li>Geen belasting-, beleggings- of financieel advies.</li>
        <li>Geen wallet of bewaardienst. Wij hebben nooit toegang tot je cryptomiddelen of sleutels en vragen daar nooit om.</li>
        <li>Geen aangifte. Jij bent zelf verantwoordelijk voor je aangifte en voor de juistheid van wat je opgeeft.</li>
      </ul>

      <h2>3. Juistheid</h2>
      <p>
        We doen ons best om de berekening correct en actueel te houden. De tarieven en rekenregels zijn ontleend aan openbare bronnen
        en worden periodiek gecontroleerd. Data van derden (blockchainverkenners, koersbronnen) kan onvolledig of onjuist zijn.
        Controleer de uitkomst daarom altijd zelf of laat dit doen door een belastingadviseur.
      </p>

      <h2>4. Aansprakelijkheid</h2>
      <p>
        De rekenhulp is gratis; voor het aangifterapport betaal je een abonnement. Voor zover de wet dat toestaat, is onze aansprakelijkheid voor schade door het gebruik van de rekenhulp
        beperkt tot [BEDRAG / het bedrag dat je in de afgelopen twaalf maanden aan ons hebt betaald]. Deze beperking geldt niet bij
        opzet of bewuste roekeloosheid van ons of onze leidinggevenden, en doet geen afbreuk aan rechten die je als consument op
        grond van dwingend recht hebt, waaronder de regels over productaansprakelijkheid.
      </p>

      <h2>5. Abonnement op het aangifterapport</h2>
      <ul>
        <li>Het abonnement kost € 35 per jaar [incl. btw / geen btw (KOR)] en wordt betaald via Stripe.</li>
        <li>
          Herroepingsrecht: je kunt binnen 14 dagen na het afsluiten zonder opgave van reden herroepen. Stuur daarvoor een bericht
          naar [E-MAIL] (het modelformulier voor herroeping staat [LINK]); je krijgt het volledige bedrag binnen 14 dagen terug.
          Opzeggen in "Abonnement beheren" alleen stopt de verlenging, maar betaalt niet automatisch terug.
        </li>
        <li>Opzeggen via "Abonnement beheren" stopt het abonnement aan het einde van de lopende periode. [Na het eerste jaar: maandelijks opzegbaar met terugbetaling van het te veel betaalde, art. 7:236 BW: laten toetsen.]</li>
        <li>De gratis rekenhulp blijft beschikbaar, ook zonder abonnement.</li>
      </ul>

      <h2>6. Beschikbaarheid</h2>
      <p>
        We kunnen de dienst tijdelijk uitschakelen, bijvoorbeeld bij een beveiligingsprobleem of als een berekening onjuist blijkt. We
        melden dit dan op de website.
      </p>

      <h2>7. Toepasselijk recht</h2>
      <p>
        Op deze voorwaarden is Nederlands recht van toepassing. Als consument kun je een geschil ook voorleggen aan de bevoegde rechter
        in je woonplaats.
      </p>

      <p className="muted small">Versie [DATUM].</p>
    </article>
  );
}
