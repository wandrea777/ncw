import { createContext, useContext, type ReactNode } from "react";

export type Lang = "NL" | "EN";

/**
 * Teksten in het Nederlands en Engels. De Engelse landingsteksten komen letterlijk uit het v0-ontwerp,
 * behalve waar het ontwerp iets beloofde dat niet bestaat (zie docs/design/kern-huisstijl.md).
 */
const STRINGS = {
  // navigatie en landing
  "nav.principles": ["Principes", "Principles"],
  "nav.security": ["Beveiliging", "Security"],
  "nav.early": ["Vroege toegang", "Early access"],
  "nav.open": ["Open wallet", "Open wallet"],
  "menu.open": ["Menu openen", "Open menu"],
  "menu.close": ["Menu sluiten", "Close menu"],
  "lang.switch": ["Taal wijzigen", "Change language"],
  "hero.kicker": ["De onafhankelijke wallet voor Europa", "The independent wallet for Europe"],
  "hero.title1": ["Jouw bezit.", "Your assets."],
  "hero.title2": ["Jouw regels.", "Your rules."],
  "hero.lede": ["KERN is een onafhankelijke wallet in eigen beheer, voor mensen die eigenaarschap serieus nemen. Ontworpen in Amsterdam. Gebouwd voor de lange termijn.", "KERN is a private, non-custodial wallet for people who take ownership seriously. Designed in Amsterdam. Built for the long term."],
  "hero.create": ["Maak je wallet", "Create your wallet"],
  "hero.why": ["Waarom KERN", "Why KERN"],
  "hero.trust": ["KERN vraagt nooit om je herstelzin", "KERN never asks for your recovery phrase"],
  "card.example": ["Voorbeeld", "Example"],
  "card.note": ["Eigendom, zichtbaar gemaakt.", "Ownership, made visible."],
  "ticker.1": ["Bezit zonder compromis", "Own without compromise"],
  "ticker.2": ["Handel met overleg", "Move with intention"],
  "ticker.3": ["Weet wat je bezit", "Know what you hold"],
  "ticker.4": ["Houd de regie", "Stay in control"],
  "principles.kicker": ["Anders gebouwd", "Built differently"],
  "principles.title1": ["Een wallet die", "A wallet that respects"],
  "principles.title2": ["je intelligentie respecteert.", "your intelligence."],
  "p1.title": ["Non-custodial, vanaf het ontwerp.", "Non-custodial, by design."],
  "p1.text": ["Je sleutels blijven bij jou. Wij bewaren geen sleutels, kunnen geen account bevriezen en vragen geen toestemming.", "Your keys stay with you. We store no keys, can freeze no accounts and require no permission."],
  "p2.title": ["Beveiliging die je kunt zien.", "Security you can see."],
  "p2.text": ["Inloggen met een passkey, zonder wachtwoord of sms. Een strikt beveiligingsbeleid in je browser en geen trackers. Vertrouwen komt uit helderheid.", "Passkey sign-in, no passwords or SMS. A strict security policy in your browser and no trackers. Confidence comes from clarity."],
  "p3.title": ["Gemaakt voor Europa.", "Made for Europe."],
  "p3.text": ["In euro's, privacy eerst, en zorgvuldig ontworpen voor de manier waarop serieuze Europeanen beleggen.", "EUR-native, privacy-first, and thoughtfully designed for the way serious Europeans invest."],
  "sec.kicker": ["Beveiligingscentrum", "Security center"],
  "sec.title1": ["Vertrouwen is", "Trust is not"],
  "sec.title2": ["geen gevoel.", "a feeling."],
  "sec.text": [
    "Het is een systeem. KERN maakt het onzichtbare zichtbaar, zodat je altijd weet wat er met je bezit gebeurt en waarom.",
    "It is a system. KERN makes the invisible visible, so you always know what is happening with your assets and why.",
  ],
  "sec.cta": ["Bekijk ons beveiligingsmodel", "Explore our security model"],
  "ring.1": ["GEEN SLEUTELS OP ONZE SERVER", "NO KEYS ON OUR SERVER"],
  "ring.2": ["PASSKEY-LOGIN", "PASSKEY SIGN-IN"],
  "ring.3": ["ALLEEN-LEZEN OP HET WEB", "WATCH-ONLY ON THE WEB"],
  "early.kicker": ["Vroege toegang", "Early access"],
  "early.title1": ["Voor wie er", "For those who"],
  "early.title2": ["vroeg bij is.", "move early."],
  "early.text": ["KERN wordt actief gebouwd. Maak nu je wallet en volg je adressen in euro's; versturen met een Ledger werkt op testnet; mainnet en de mobiele app volgen.", "KERN is in active development. Create your wallet now and follow your addresses in euros; sending with a Ledger works on testnet; mainnet and the mobile app are next."],
  "early.row": ["Inloggen met een passkey", "Passkey sign-in"],
  "early.rowNote": ["Geen wachtwoord, geen sms", "No password, no SMS"],
  "footer.tagline": ["Jouw bezit. Jouw regels.", "Your assets. Your rules."],
  "footer.privacy": ["Privacy", "Privacy"],
  "footer.terms": ["Voorwaarden", "Terms"],
  "footer.security": ["Beveiliging", "Security"],

  // inloggen
  "auth.createTitle": ["Maak je wallet", "Create your wallet"],
  "auth.createText": [
    "Je logt in met een passkey (Face ID, vingerafdruk of beveiligingssleutel). Geen wachtwoord, geen sms. Je passkey geeft toegang tot je account, nooit tot je geld.",
    "You sign in with a passkey (Face ID, fingerprint or security key). No password, no SMS. Your passkey unlocks your account, never your funds.",
  ],
  "auth.name": ["Naam", "Name"],
  "auth.namePlaceholder": ["Bijv. Alex", "E.g. Alex"],
  "auth.create": ["Passkey aanmaken", "Create passkey"],
  "auth.haveAccount": ["Heb je al een wallet?", "Already have a wallet?"],
  "auth.signInLink": ["Inloggen", "Sign in"],
  "auth.signInTitle": ["Inloggen", "Sign in"],
  "auth.signInText": ["Log in met de passkey die je eerder voor KERN hebt gemaakt.", "Sign in with the passkey you created for KERN."],
  "auth.signIn": ["Inloggen met passkey", "Sign in with passkey"],
  "auth.noAccount": ["Nog geen wallet?", "No wallet yet?"],
  "auth.createLink": ["Maak er een", "Create one"],
  "auth.busy": ["Bevestig met je passkey…", "Confirm with your passkey…"],
  "auth.cancelled": ["De passkey-bevestiging is geannuleerd.", "The passkey confirmation was cancelled."],
  "auth.unsupported": ["Deze browser ondersteunt geen passkeys.", "This browser does not support passkeys."],
  "auth.offline": ["De KERN-server is niet bereikbaar. Probeer het later opnieuw.", "The KERN server is not reachable. Please try again later."],
  "auth.nameRequired": ["Vul een naam in.", "Enter a name."],
  "close": ["Sluiten", "Close"],
  "back": ["Terug naar KERN", "Back to KERN"],
  "blocked.title": ["Tijdelijk uitgeschakeld.", "Temporarily disabled."],
  "blocked.text": ["We onderzoeken een probleem. Probeer het later opnieuw.", "We are investigating a problem. Please try again later."],
  "sessionExpired": ["Je sessie is verlopen. Log opnieuw in.", "Your session has expired. Please sign in again."],
  "signOutFailed": ["Uitloggen is niet bevestigd door de server. Controleer je verbinding en probeer opnieuw.", "Sign-out was not confirmed by the server. Check your connection and try again."],
  "copyFailed": ["Kopiëren is mislukt. Selecteer het adres en kopieer het handmatig.", "Copying failed. Select the address and copy it manually."],
  "refresh": ["Vernieuwen", "Refresh"],
  "period": ["Periode", "Period"],
  "addressError": ["Adres {address} kon niet worden geladen.", "Address {address} could not be loaded."],
  "priceError": ["Koersen konden niet worden geladen.", "Prices could not be loaded."],

  // dashboard
  "dash.nav": ["Wallet-navigatie", "Wallet navigation"],
  "tab.overview": ["Overzicht", "Overview"],
  "tab.assets": ["Bezittingen", "Assets"],
  "tab.activity": ["Activiteit", "Activity"],
  "tab.tax": ["Box 3", "Box 3"],
  "tab.security": ["Beveiliging", "Security"],
  "network": ["Mainnet · alleen-lezen", "Mainnet · watch-only"],
  "mini.title": ["Self-custody", "Self-custody"],
  "mini.text": ["Je sleutels blijven van jou", "Your keys stay yours"],
  "greet.morning": ["Goedemorgen", "Good morning"],
  "greet.afternoon": ["Goedemiddag", "Good afternoon"],
  "greet.evening": ["Goedenavond", "Good evening"],
  "addAddress": ["Adres toevoegen", "Add address"],
  "total": ["Totaal saldo", "Total balance"],
  "hideBalance": ["Saldo verbergen", "Hide balance"],
  "showBalance": ["Saldo tonen", "Show balance"],
  "vsYesterday": ["t.o.v. gisteren", "vs. yesterday"],
  "send": ["Versturen", "Send"],
  "receive": ["Ontvangen", "Receive"],
  "tax": ["Box 3", "Box 3"],
  "perf": ["Waardeverloop", "Portfolio performance"],
  "chartLabel": ["Grafiek van de waarde van je portefeuille", "Portfolio performance chart"],
  "chartEmpty": ["Nog geen koersgeschiedenis voor deze periode", "No price history for this period yet"],
  "yourAssets": ["Je bezittingen", "Your assets"],
  "holdings": ["Bezittingen", "Holdings"],
  "latest": ["Laatste", "Latest"],
  "activity": ["Activiteit", "Activity"],
  "viewAll": ["Alles bekijken", "View all"],
  "txHistory": ["Transactiegeschiedenis", "Transaction history"],
  "securityCenter": ["Beveiligingscentrum", "Security center"],
  "boxTitle": ["Box 3-overzicht", "Box 3 overview"],
  "received": ["Ontvangen", "Received"],
  "sent": ["Verstuurd", "Sent"],
  "internal": ["Eigen overboeking", "Internal transfer"],
  "loading": ["Saldi en koersen ophalen…", "Loading balances and prices…"],
  "priceNote": ["Koersen: dagopening {day} (00:00 UTC), Binance. Saldi: mempool.space en Blockscout.", "Prices: daily open {day} (00:00 UTC), Binance. Balances: mempool.space and Blockscout."],
  "retry": ["Opnieuw", "Retry"],
  "empty.title": ["Nog geen adressen", "No addresses yet"],
  "empty.text": [
    "Voeg een publiek Bitcoin- of Ethereum-adres toe. KERN leest alleen; er is geen sleutel nodig.",
    "Add a public Bitcoin or Ethereum address. KERN only reads; no key is needed.",
  ],
  "noHoldings": ["Nog geen bezittingen.", "No holdings yet."],
  "noActivity": ["Nog geen transacties.", "No transactions yet."],
  "addresses": ["Adressen", "Addresses"],
  "remove": ["Verwijderen", "Remove"],
  "addressCount": ["{n} adressen", "{n} addresses"],
  "addressCount.one": ["{n} adres", "{n} address"],
  "footer.dash": ["Non-custodial: KERN bewaart geen sleutels", "Non-custodial: KERN stores no keys"],
  "footer.version": ["v{v} · alleen-lezen op mainnet", "v{v} · watch-only on mainnet"],
  "signOut": ["Uitloggen", "Sign out"],
  "signOutWipe": ["Uitloggen en dit apparaat wissen", "Sign out and clear this device"],
  "profileMenu": ["Profielmenu", "Profile menu"],

  // geld toevoegen (kopen via partner, ADR-0014)
  "addFunds": ["Geld toevoegen", "Add funds"],
  "buy.title": ["Geld toevoegen", "Add funds"],
  "buy.text": [
    "Je koopt crypto bij {partner}, een partij met een MiCA-vergunning. Zij doen de betaling, de identiteitscontrole en sturen de crypto rechtstreeks naar jouw adres. KERN komt nooit aan je geld.",
    "You buy crypto from {partner}, a MiCA-licensed provider. They handle payment and identity checks and send the crypto straight to your address. KERN never touches your money.",
  ],
  "buy.demo": ["Testomgeving van de partner: er wordt geen echt geld afgeschreven", "Partner test environment: no real money is charged"],
  "buy.asset": ["Munt", "Asset"],
  "buy.amount": ["Bedrag in euro (€10–€10.000)", "Amount in euros (€10–€10,000)"],
  "buy.to": ["Gevolgd adres", "Followed address"],
  "buy.confirmOwn": ["Dit adres beheer ik zelf (ik heb de sleutel). Vul het in bij de partner.", "I control this address myself (I hold the key). Prefill it at the partner."],
  "buy.noPrefill": ["Zonder vinkje vul je het adres zelf in bij {partner}.", "Without the checkbox, you enter the address yourself at {partner}."],
  "buy.amountInvalid": ["Vul een heel bedrag in euro's in, tussen 10 en 10.000 (zonder komma of punt).", "Enter a whole amount in euros between 10 and 10,000 (no comma or dot)."],
  "buy.noAddress": ["Je hebt nog geen adres voor deze munt. Je kunt het adres bij de partner invullen.", "You have no address for this asset yet. You can enter it at the partner."],
  "buy.pasteAddress": ["{partner} vraagt zelf om je adres: kopieer het hier en plak het daar.", "{partner} asks for your address itself: copy it here and paste it there."],
  "buy.invalid": ["Controleer het bedrag en het adres.", "Check the amount and the address."],
  "buy.go": ["Verder naar {partner}", "Continue to {partner}"],
  "buy.disclosure": [
    "Doorverwijzing. Je sluit de overeenkomst met {entity} ({license}); hun voorwaarden en kosten gelden. KERN ontvangt een vergoeding van {partner} voor deze doorverwijzing. Dit is geen beleggingsadvies.",
    "Referral. You contract with {entity} ({license}); their terms and fees apply. KERN receives a fee from {partner} for this referral. This is not investment advice.",
  ],
  "buy.inactive": ["Nog niet actief", "Not active yet"],
  "buy.inactiveText": [
    "Kopen gaat straks via een partner met een MiCA-vergunning. KERN komt daarbij nooit aan je geld. Deze functie wordt actief zodra het partnercontract rond is.",
    "Buying will go through a MiCA-licensed partner. KERN never touches your money. This feature activates once the partner agreement is in place.",
  ],

  // adres toevoegen
  "add.title": ["Adres toevoegen", "Add address"],
  "add.text": [
    "Plak een publiek Bitcoin-adres (bc1…, 1…, 3…) of Ethereum-adres (0x…). Vul nooit je herstelzin of privésleutel in.",
    "Paste a public Bitcoin address (bc1…, 1…, 3…) or Ethereum address (0x…). Never enter your recovery phrase or private key.",
  ],
  "add.label": ["Publiek adres", "Public address"],
  "add.labelName": ["Label (optioneel)", "Label (optional)"],
  "add.submit": ["Toevoegen", "Add"],
  "add.duplicate": ["Dit adres volg je al.", "You already follow this address."],
  "add.invalid": ["Dit is geen geldig Bitcoin- of Ethereum-adres.", "This is not a valid Bitcoin or Ethereum address."],
  "add.secretWarning": [
    "Dit lijkt op een herstelzin of privésleutel. Deel die nooit, ook niet met KERN.",
    "This looks like a recovery phrase or private key. Never share it, not even with KERN.",
  ],
  "add.storage": [
    "Je adressen worden alleen op dit apparaat bewaard, niet op onze server.",
    "Your addresses are stored on this device only, not on our server.",
  ],

  // ontvangen / versturen
  "recv.title": ["Ontvangen", "Receive"],
  "recv.text": [
    "Laat de afzender dit adres scannen of kopiëren. Controleer het volledige adres, blok voor blok.",
    "Let the sender scan or copy this address. Check the full address, block by block.",
  ],
  "recv.copy": ["Adres kopiëren", "Copy address"],
  "recv.choose": ["Kies een adres", "Choose an address"],
  "recv.ownOnly": [
    "Gebruik dit alleen als ontvangstadres als het van jou is. KERN volgt ook adressen van anderen (bijvoorbeeld een beurs). Controleer het volledige adres, het liefst op het scherm van je hardware wallet.",
    "Only use this as a receive address if it is yours. KERN also follows other people's addresses (for example an exchange). Check the full address, ideally on your hardware wallet's screen.",
  ],
  "recv.copied": ["Ontvangstadres gekopieerd", "Receive address copied"],
  "recv.none": ["Voeg eerst een adres toe.", "Add an address first."],
  "recv.network": ["Alleen {asset} op het {net}-netwerk naar dit adres sturen.", "Only send {asset} on the {net} network to this address."],
  "send.title": ["Versturen", "Send"],
  "send.testnet": ["Alleen testnet (testnet4) · geen echt geld", "Testnet only (testnet4) · no real money"],
  "send.intro": [
    "Op het web onderteken je alleen met een Ledger. Je sleutel blijft op het apparaat; je controleert ontvanger, bedrag en vergoeding op het scherm van de Ledger. KERN bewaart niets van deze transactie. Ledger via de browser werkt in Chrome, Edge en Brave.",
    "On the web you sign only with a Ledger. Your key stays on the device; you check recipient, amount and fee on the Ledger's screen. KERN stores nothing about this transaction. Ledger in the browser works in Chrome, Edge and Brave.",
  ],
  "send.step1": ["Sluit je Ledger aan en ontgrendel hem met je pincode.", "Connect your Ledger and unlock it with your PIN."],
  "send.step2": ["Open de app \"Bitcoin Test\" (installeer hem via Ledger Live met de ontwikkelaarsmodus aan).", "Open the \"Bitcoin Test\" app (install it in Ledger Live with developer mode on)."],
  "send.step3": ["Klik hieronder en kies je Ledger in het venster van de browser.", "Click below and choose your Ledger in the browser's window."],
  "send.connect": ["Verbind je Ledger", "Connect your Ledger"],
  "send.unsupported": [
    "Deze browser ondersteunt geen hardware wallets via WebHID. Gebruik Chrome, Edge of Brave op een computer.",
    "This browser does not support hardware wallets via WebHID. Use Chrome, Edge or Brave on a computer.",
  ],
  "send.connecting": ["Verbinden met je Ledger…", "Connecting to your Ledger…"],
  "send.scanning": ["Je testnet-account zoeken: {n} adressen gecontroleerd…", "Finding your testnet account: {n} addresses checked…"],
  "send.balance": ["Beschikbaar (bevestigd)", "Available (confirmed)"],
  "send.pending": ["Nog onbevestigd", "Still unconfirmed"],
  "send.receiveOwn": ["Testnet-coins ontvangen op deze Ledger", "Receive testnet coins on this Ledger"],
  "send.showOnDevice": ["Toon dit adres op mijn Ledger", "Show this address on my Ledger"],
  "send.shownOk": ["Op je Ledger getoond. Klopt het met wat hier staat?", "Shown on your Ledger. Does it match what you see here?"],
  "send.confirmOnDevice": ["Bevestig op je Ledger…", "Confirm on your Ledger…"],
  "send.to": ["Naar adres", "To address"],
  "send.amount": ["Bedrag (tBTC)", "Amount (tBTC)"],
  "send.fee": ["Netwerkvergoeding", "Network fee"],
  "send.speed.slow": ["Langzaam", "Slow"],
  "send.speed.normal": ["Normaal", "Normal"],
  "send.speed.fast": ["Snel", "Fast"],
  "send.similar": [
    "Let op: dit adres lijkt aan begin en eind op {a}, maar is een ander adres. Oplichters gebruiken lijkende adressen. Controleer het volledige adres.",
    "Careful: this address looks like {a} at the start and end, but it is a different address. Scammers use look-alike addresses. Check the full address.",
  ],
  "send.review": ["Controleren", "Review"],
  "send.total": ["Totaal van je saldo af", "Total from your balance"],
  "send.highFee": ["De vergoeding is meer dan 10% van het bedrag.", "The fee is more than 10% of the amount."],
  "send.checkDevice": [
    "Je Ledger toont zo het adres, het bedrag en de vergoeding. Vergelijk het adres teken voor teken met wat hierboven staat. Wijkt iets af: weiger op je Ledger.",
    "Your Ledger will show the address, amount and fee. Compare the address character by character with the one above. If anything differs, reject on your Ledger.",
  ],
  "send.back": ["Terug", "Back"],
  "send.sign": ["Onderteken op je Ledger", "Sign on your Ledger"],
  "send.done": ["Verstuurd. Het netwerk heeft je transactie ontvangen.", "Sent. The network has received your transaction."],
  "send.explorer": ["Bekijk op mempool.space", "View on mempool.space"],
  "send.retry": ["Opnieuw proberen", "Try again"],
  "send.err.unsupported": ["Deze browser ondersteunt geen WebHID. Gebruik Chrome, Edge of Brave.", "This browser does not support WebHID. Use Chrome, Edge or Brave."],
  "send.err.cancelled": ["Geen Ledger gekozen.", "No Ledger selected."],
  "send.err.locked": ["Je Ledger is vergrendeld. Ontgrendel hem met je pincode.", "Your Ledger is locked. Unlock it with your PIN."],
  "send.err.wrong-app": ["Open de app \"Bitcoin Test\" op je Ledger.", "Open the \"Bitcoin Test\" app on your Ledger."],
  "send.err.mainnet-app": [
    "De app \"Bitcoin\" (echt geld) is open. KERN werkt nu alleen met \"Bitcoin Test\". Sluit de app en open \"Bitcoin Test\".",
    "The \"Bitcoin\" app (real money) is open. KERN currently works only with \"Bitcoin Test\". Close it and open \"Bitcoin Test\".",
  ],
  "send.err.old-app": ["Werk de app \"Bitcoin Test\" bij via Ledger Live (minimaal versie 2.1).", "Update the \"Bitcoin Test\" app in Ledger Live (version 2.1 or later)."],
  "send.err.rejected": ["Geweigerd op je Ledger. Er is niets verstuurd.", "Rejected on your Ledger. Nothing was sent."],
  "send.err.disconnected": ["De verbinding met je Ledger is verbroken.", "The connection to your Ledger was lost."],
  "send.err.unknown": ["Er ging iets mis. Er is niets verstuurd.", "Something went wrong. Nothing was sent."],
  "send.err.address-empty": ["Vul een adres in.", "Enter an address."],
  "send.err.address-mainnet": ["Dit is een mainnet-adres. KERN verstuurt nu alleen op testnet.", "This is a mainnet address. KERN currently sends on testnet only."],
  "send.err.address-invalid": ["Ongeldig testnet-adres. Controleer het op typfouten.", "Invalid testnet address. Check it for typos."],
  "send.err.amount-invalid": ["Ongeldig bedrag. Bijvoorbeeld 0,001 (maximaal 8 decimalen).", "Invalid amount. For example 0.001 (at most 8 decimals)."],
  "send.err.amount-too-small": ["Het minimum is 0,00000546 tBTC.", "The minimum is 0.00000546 tBTC."],
  "send.err.insufficient-funds": ["Onvoldoende bevestigd saldo voor dit bedrag plus de vergoeding.", "Not enough confirmed balance for this amount plus the fee."],
  "send.err.fee-invalid": ["Ongeldige netwerkvergoeding.", "Invalid network fee."],
  "send.err.account-invalid": [
    "Het adres van je Ledger klopt niet met wat KERN berekende. Er is niets verstuurd. Meld dit via de beveiligingspagina.",
    "Your Ledger's address does not match what KERN calculated. Nothing was sent. Please report this via the security page.",
  ],
  "send.err.plan-mismatch": ["De transactie klopte niet bij controle en is niet ondertekend.", "The transaction failed our check and was not signed."],
  "send.err.utxo-mismatch": ["De gegevens van mempool.space klopten niet. Er is niets verstuurd.", "The data from mempool.space did not match. Nothing was sent."],
  "send.err.signature-mismatch": ["De handtekeningen van je Ledger klopten niet. Er is niets verstuurd.", "Your Ledger's signatures did not match. Nothing was sent."],
  "send.err.network": ["mempool.space is niet bereikbaar of weigerde de transactie. Probeer het later opnieuw.", "mempool.space is unreachable or refused the transaction. Try again later."],

  // beveiliging
  "s.passkeys": ["Passkey-login", "Passkey sign-in"],
  "s.passkeysText": ["{n} passkeys op je account", "{n} passkeys on your account"],
  "s.passkeysText.one": ["{n} passkey op je account", "{n} passkey on your account"],
  "s.revokeFailed": ["Uitloggen op andere apparaten is mislukt. Probeer het opnieuw.", "Signing out other devices failed. Please try again."],
  "s.loadFailed": ["Je passkeys konden niet worden geladen.", "Your passkeys could not be loaded."],
  "s.active": ["Actief", "Active"],
  "s.keys": ["Sleutels", "Keys"],
  "s.keysText": ["KERN bewaart geen privésleutels of herstelzinnen", "KERN stores no private keys or recovery phrases"],
  "s.watch": ["Alleen-lezen", "Watch-only"],
  "s.session": ["Sessie", "Session"],
  "s.sessionText": ["Automatisch uitgelogd na 30 minuten inactiviteit", "Automatic sign-out after 30 minutes of inactivity"],
  "s.enabled": ["Ingeschakeld", "Enabled"],
  "s.revoke": ["Andere apparaten uitloggen", "Sign out other devices"],
  "s.revoked": ["Andere sessies beëindigd: {n}", "Other sessions ended: {n}"],
  "s.passkeyList": ["Je passkeys", "Your passkeys"],
  "s.synced": ["gesynchroniseerd", "synced"],
  "s.device": ["apparaatgebonden", "device-bound"],
  "s.created": ["aangemaakt {d}", "created {d}"],
} as const satisfies Record<string, readonly [string, string]>;

export type Key = keyof typeof STRINGS;

export function translate(lang: Lang, key: Key, vars: Record<string, string | number> = {}): string {
  const s: string = STRINGS[key][lang === "NL" ? 0 : 1];
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

export const LOCALE: Record<Lang, string> = { NL: "nl-NL", EN: "en-GB" };

interface I18n {
  lang: Lang;
  setLang(l: Lang): void;
  t(key: Key, vars?: Record<string, string | number>): string;
  locale: string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ lang, setLang, children }: { lang: Lang; setLang(l: Lang): void; children: ReactNode }) {
  return <Ctx.Provider value={{ lang, setLang, t: (k, v) => translate(lang, k, v), locale: LOCALE[lang] }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n buiten I18nProvider");
  return v;
}

export { STRINGS };
