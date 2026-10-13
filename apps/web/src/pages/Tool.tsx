import { useMemo, useState } from "react";
import {
  ASSETS,
  SUPPORTED_YEARS,
  berekenBox3,
  checkAddress,
  fetchBitcoinHistory,
  fetchDailyEurPrices,
  fetchEthereumHistory,
  flowKey,
  getParams,
  parseEur,
  valueAssetYear,
  type AddressHistory,
  type AssetYearResult,
  type Chain,
  type IncomingClass,
  type PriceSeries,
} from "@ncw/core";
import { fmtDate, fmtEur, fmtNum, fmtPct, shortAddr } from "../lib/format";
import { looksLikeSecret } from "../lib/secrets";

interface Entry {
  address: string;
  chain: Chain;
}

interface Fetched {
  year: number;
  histories: AddressHistory[];
  prices: Partial<Record<Chain, PriceSeries>>;
}

const OVERIG_VELDEN = [
  ["banktegoedenBegin", "Banktegoeden op 1 januari", "Saldo van al je spaar- en betaalrekeningen."],
  ["ontvangenRente", "Ontvangen rente in het jaar", "Werkelijk rendement op banktegoeden."],
  ["overigeBezittingenBegin", "Overige bezittingen op 1 januari (zonder de crypto hierboven)", "Beleggingen, crypto op exchanges, tweede woning, enz."],
  ["overigeWerkelijkRendement", "Werkelijk rendement op die overige bezittingen", "Dividend plus waardeverandering. Mag negatief zijn."],
  ["schuldenBegin", "Schulden in box 3 op 1 januari", "Geen hypotheek van je eigen woning."],
  ["betaaldeRente", "Betaalde rente op die schulden", "Aftrekbaar in het werkelijk rendement."],
] as const;

type OverigKey = (typeof OVERIG_VELDEN)[number][0];

export function Tool({ disabled, initialAddresses = [] }: { disabled: boolean; initialAddresses?: Array<{ address: string; chain: Chain }> }) {
  const defaultYear = SUPPORTED_YEARS.filter((y) => y < new Date().getUTCFullYear()).at(-1) ?? SUPPORTED_YEARS[0]!;
  const [year, setYear] = useState<number>(defaultYear);
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>(() => initialAddresses.map(({ address, chain }) => ({ address, chain })));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [classes, setClasses] = useState<Record<string, IncomingClass>>({});
  const [overig, setOverig] = useState<Record<OverigKey, string>>({
    banktegoedenBegin: "",
    ontvangenRente: "",
    overigeBezittingenBegin: "",
    overigeWerkelijkRendement: "",
    schuldenBegin: "",
    betaaldeRente: "",
  });

  const params = getParams(year);

  function addAddress() {
    const parts = input.split(/[\s,;]+/).filter(Boolean);
    // Geheel én elk deel controleren (bijv. een adres met daarachter een sleutel). Bij twijfel wissen, nooit tonen.
    if (looksLikeSecret(input) || parts.some(looksLikeSecret)) {
      setInput("");
      setInputError("Dit lijkt op een herstelzin of privésleutel. Deel die nooit, ook niet met KERN. De invoer is gewist.");
      return;
    }
    const added: Entry[] = [];
    for (const [i, p] of parts.entries()) {
      const r = checkAddress(p);
      if (!r.ok) {
        // Alleen een fragment tonen als het op een adres lijkt; anders het volgnummer (geen sleutelfragmenten in beeld).
        const looksLikeAddress = /^(bc1|[13]|0x)[0-9a-zA-Z]{20,90}$/.test(p);
        setInputError(`${looksLikeAddress ? shortAddr(p) : `Invoer ${i + 1}`}: ${r.reason}`);
        return;
      }
      if (![...entries, ...added].some((e) => e.address === r.normalized)) added.push({ address: r.normalized, chain: r.chain });
    }
    setEntries([...entries, ...added]);
    setInput("");
    setInputError(null);
    setFetched(null);
  }

  async function run() {
    setError(null);
    setFetched(null);
    try {
      const histories: AddressHistory[] = [];
      for (const [i, e] of entries.entries()) {
        setBusy(`Adres ${i + 1} van ${entries.length} ophalen…`);
        histories.push(e.chain === "bitcoin" ? await fetchBitcoinHistory(e.address) : await fetchEthereumHistory(e.address));
      }
      const prices: Fetched["prices"] = {};
      for (const chain of new Set(entries.map((e) => e.chain))) {
        setBusy(`Koersen ${ASSETS[chain].symbol}/EUR ophalen…`);
        prices[chain] = await fetchDailyEurPrices(ASSETS[chain].symbol, year);
      }
      setFetched({ year, histories, prices });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const assetResults: AssetYearResult[] = useMemo(() => {
    if (!fetched) return [];
    return (Object.keys(fetched.prices) as Chain[]).map((chain) =>
      valueAssetYear({
        year: fetched.year,
        asset: ASSETS[chain],
        histories: fetched.histories.filter((h) => h.asset.chain === chain),
        prices: fetched.prices[chain]!,
        classifications: classes,
      }),
    );
  }, [fetched, classes]);

  const overigNum = Object.fromEntries(Object.entries(overig).map(([k, v]) => [k, parseEur(v)])) as Record<OverigKey, number>;
  const overigInvalid = Object.values(overigNum).some((n) => Number.isNaN(n));

  const result =
    fetched && !overigInvalid
      ? berekenBox3({
          year: fetched.year,
          ...overigNum,
          cryptoBegin: assetResults.reduce((a, r) => a + r.valueBegin, 0),
          cryptoWerkelijkRendement: assetResults.reduce((a, r) => a + r.werkelijkRendement, 0),
        })
      : null;

  return (
    <div className="tool">
      <section className="tool-intro">
        <p className="lead">
          Vergelijk het forfaitaire rendement met je werkelijke rendement (de tegenbewijsregeling). Je voert alleen
          publieke adressen in. <strong>Nooit je herstelzin of privésleutel.</strong> De berekening draait volledig in je
          browser; wij ontvangen en bewaren niets.
        </p>
      </section>

      <section className="card">
        <h2>1. Belastingjaar</h2>
        <div className="row">
          <select aria-label="Belastingjaar" value={year} onChange={(e) => (setYear(Number(e.target.value)), setFetched(null))} disabled={disabled}>
            {SUPPORTED_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
                {y >= new Date().getUTCFullYear() ? " (lopend jaar, indicatief)" : ""}
              </option>
            ))}
          </select>
          {!params.verified && (
            <span className="badge badge-warn" title="De tarieven voor dit jaar zijn nog niet handmatig gecontroleerd bij de Belastingdienst.">
              Tarieven nog niet geverifieerd
            </span>
          )}
        </div>
        <p className="muted small">
          Forfaitair: banktegoeden {fmtPct(params.pct.banktegoeden)}, overige bezittingen {fmtPct(params.pct.overigeBezittingen)},
          schulden {fmtPct(params.pct.schulden)}. Heffingsvrij vermogen {fmtEur(params.heffingsvrijVermogen)}, tarief{" "}
          {fmtPct(params.tarief)}.{params.voorlopig.length > 0 && ` Voorlopig: ${params.voorlopig.join(", ")}.`}
        </p>
      </section>

      <section className="card">
        <h2>2. Je crypto-adressen</h2>
        <p className="muted small">Bitcoin- en Ethereum-adressen (alleen ETH zelf; tokens zoals USDC worden nog niet meegeteld).</p>
        <div className="row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addAddress()}
            placeholder="bc1… of 0x…"
            aria-label="Publiek adres"
            aria-invalid={inputError ? true : undefined}
            disabled={disabled}
            spellCheck={false}
            autoComplete="off"
          />
          <button onClick={addAddress} disabled={disabled || !input.trim()}>
            Toevoegen
          </button>
        </div>
        {inputError && <p className="error" role="alert">{inputError}</p>}
        {entries.length > 0 && (
          <ul className="chips">
            {entries.map((e) => (
              <li key={e.address}>
                <span className="chip-chain">{ASSETS[e.chain].symbol}</span> <code>{shortAddr(e.address)}</code>
                <button
                  className="link"
                  aria-label={`Verwijder ${e.address}`}
                  onClick={() => (setEntries(entries.filter((x) => x !== e)), setFetched(null))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <button className="primary" onClick={run} disabled={disabled || entries.length === 0 || busy !== null}>
          {busy ?? "Ophalen en berekenen"}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      {assetResults.map((r) => (
        <section className="card" key={r.asset.symbol}>
          <h2>
            {r.asset.symbol} in {r.year}
            {r.indicatief && <span className="badge badge-warn">Indicatief</span>}
          </h2>
          {r.warnings.map((w) => (
            <p key={w} className="warn">{w}</p>
          ))}
          <table className="kv">
            <tbody>
              <tr><th>Saldo 1 januari</th><td>{fmtNum(r.unitsBegin)} {r.asset.symbol} × {fmtEur(r.priceBegin)} = <strong>{fmtEur(r.valueBegin)}</strong></td></tr>
              <tr><th>{r.indicatief ? "Saldo nu" : `Saldo 1 januari ${r.year + 1}`}</th><td>{fmtNum(r.unitsEnd)} {r.asset.symbol} × {fmtEur(r.priceEnd)} = <strong>{fmtEur(r.valueEnd)}</strong></td></tr>
              <tr><th>Inbreng (aankopen, ontvangsten)</th><td>{fmtEur(r.inbreng)}</td></tr>
              <tr><th>Onttrekking (verkopen, verzendingen, fees)</th><td>{fmtEur(r.onttrekking)}</td></tr>
              <tr><th>Opbrengsten (staking, airdrops)</th><td>{fmtEur(r.opbrengsten)}</td></tr>
              <tr className="total"><th>Werkelijk rendement</th><td>{fmtEur(r.werkelijkRendement)}</td></tr>
            </tbody>
          </table>

          {r.flows.some((f) => f.direction === "in" && !f.internal) && (
            <details>
              <summary>Ontvangsten classificeren ({r.flows.filter((f) => f.direction === "in" && !f.internal).length})</summary>
              <p className="muted small">
                Standaard telt elke ontvangst als <em>inbreng</em> (bijv. gekocht op een exchange en naar je wallet gestuurd).
                Was het een beloning, zoals staking, een airdrop of een betaling voor werk? Kies dan <em>opbrengst</em>; die telt als
                rendement. Een verkeerde keuze kan leiden tot een te lage aangifte.
              </p>
              <table className="flows">
                <thead>
                  <tr><th>Datum</th><th>Hoeveelheid</th><th>Waarde</th><th>Soort</th></tr>
                </thead>
                <tbody>
                  {r.flows
                    .filter((f) => f.direction === "in" && !f.internal)
                    .map((f) => {
                      const key = flowKey(f);
                      return (
                        <tr key={key}>
                          <td>{fmtDate(f.timestamp)}</td>
                          <td>{fmtNum(Number(f.delta) / 10 ** r.asset.decimals)}</td>
                          <td>{fmtEur(f.valueEur)}</td>
                          <td>
                            <select
                              value={classes[key] ?? "inbreng"}
                              onChange={(e) => setClasses({ ...classes, [key]: e.target.value as IncomingClass })}
                              aria-label={`Soort ontvangst op ${fmtDate(f.timestamp)}`}
                            >
                              <option value="inbreng">Inbreng</option>
                              <option value="opbrengst">Opbrengst</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </details>
          )}
          <p className="muted small">
            Koersbron: {fetched?.prices[r.asset.chain]?.source}. Waardering per UTC-dag; kleine afwijkingen met andere bronnen zijn mogelijk.
          </p>
        </section>
      ))}

      {fetched && (
        <section className="card">
          <h2>3. Je overige box 3-vermogen</h2>
          <p className="muted small">
            De tegenbewijsregeling geldt voor je <strong>hele</strong> box 3-vermogen, niet alleen voor crypto. Vul daarom ook je
            overige vermogen in. Heb je een fiscale partner? Dan is deze rekenhulp nog niet geschikt.
          </p>
          <div className="grid">
            {OVERIG_VELDEN.map(([key, label, hint]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  inputMode="decimal"
                  value={overig[key]}
                  onChange={(e) => setOverig({ ...overig, [key]: e.target.value })}
                  placeholder="0"
                  aria-invalid={Number.isNaN(overigNum[key]) ? true : undefined}
                />
                <small className="muted">{hint}</small>
              </label>
            ))}
          </div>
          {overigInvalid && <p className="error">Een of meer bedragen zijn ongeldig.</p>}
        </section>
      )}

      {result && (
        <section className="card result">
          <h2>4. Uitkomst {fetched!.year}</h2>
          <div className={`verdict ${result.owrGunstiger ? "verdict-good" : ""}`}>
            {result.owrGunstiger ? (
              <>
                <strong>De tegenbewijsregeling lijkt voordeliger.</strong> Geschatte besparing: {fmtEur(result.geschatteBesparing)}.
                Je kunt dit opgeven met het formulier <em>Opgaaf werkelijk rendement</em> van de Belastingdienst.
              </>
            ) : (
              <>
                <strong>Het forfaitaire stelsel is voor jou niet ongunstiger.</strong> Je werkelijke rendement is hoger dan of gelijk
                aan het forfaitaire voordeel, dus de tegenbewijsregeling levert niets op.
              </>
            )}
          </div>
          <table className="kv">
            <tbody>
              <tr><th>Rendementsgrondslag</th><td>{fmtEur(result.forfaitair.rendementsgrondslag)}</td></tr>
              <tr><th>Forfaitair rendement</th><td>{fmtEur(result.forfaitair.forfaitairRendement)} ({fmtPct(result.forfaitair.effectiefPercentage)})</td></tr>
              <tr><th>Voordeel na heffingsvrij vermogen</th><td>{fmtEur(result.forfaitair.voordeel)}</td></tr>
              <tr><th>Belasting forfaitair</th><td>{fmtEur(result.forfaitair.belasting)}</td></tr>
              <tr><th>Werkelijk rendement (totaal)</th><td>{fmtEur(result.werkelijk.werkelijkRendement)}</td></tr>
              <tr className="total"><th>Belasting werkelijk rendement</th><td>{fmtEur(result.werkelijk.belasting)}</td></tr>
            </tbody>
          </table>
          <ul className="muted small">
            <li>Het heffingsvrij vermogen geldt niet voor het werkelijk rendement (Wet tegenbewijsregeling box 3).</li>
            <li>Kosten zijn niet aftrekbaar; netwerkfees verlagen je rendement daarom niet.</li>
            <li>Ongerealiseerde koerswinst en -verlies tellen mee.</li>
            {!result.params.verified && <li><strong>De tarieven voor dit jaar zijn nog niet handmatig geverifieerd.</strong></li>}
            {assetResults.some((r) => r.indicatief) && <li><strong>Lopend jaar: de uitkomst verandert nog.</strong></li>}
          </ul>
          <button onClick={() => window.print()}>Afdrukken of opslaan als PDF</button>
          <p className="disclaimer">
            Dit is een rekenhulp op basis van publieke blockchaindata en jouw eigen invoer, geen belastingadvies. Data van derden kan
            onvolledig zijn. Controleer de uitkomst voordat je aangifte doet of bezwaar maakt.
          </p>
        </section>
      )}
    </div>
  );
}
