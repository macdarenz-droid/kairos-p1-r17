import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ecbCanProvideRate, ecbRateNeeds, fetchMissingEcbRates, type EcbReferenceRatesPort } from '../../application/currency/ecbRates';
import { loadHomeCurrency, saveHomeCurrency, type HomeCurrencyPreference } from '../../application/currency/homeCurrency';
import { listSavedExchangeRates, saveTypedExchangeRate } from '../../application/currency/exchangeRates';
import { loadMissingExchangeRates, type MissingExchangeRate } from '../../application/currency/resultsInHomeCurrency';
import {
  currencyDayLabel, describeCurrencyOption, describeEcbFetchResult, describeHomeCurrencySaved, describeMissingRate, describeSavedRate,
  describeTypedRateSaved, missingRateLabel, missingRateSaveLabel,
} from '../../application/currency/currencyWords';
import { ECB_REFERENCE_CURRENCIES, USD_STABLECOINS, type ExchangeRateRecord, type UsdStablecoin } from '../../domain/calculations/currencyConversion';
import type { KairosDatabase } from '../../data/database';
import { Button, Card, Field } from '../../design-system/primitives';
import { GlossaryHint } from '../learn/GlossaryHint';
import './currency.css';

export interface CurrencyScreenProps {
  readonly db: KairosDatabase;
  /** The bank's rates; the composition root builds the port (D31). */
  readonly rates: EcbReferenceRatesPort;
  /** The current instant (UTC ISO); tests inject a fixed one. */
  readonly now?: () => string;
}

type ScreenState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'failed' }>
  | Readonly<{ kind: 'ready'; home: HomeCurrencyPreference | null; rates: readonly ExchangeRateRecord[]; missing: readonly MissingExchangeRate[] }>;
type SaveMessage = Readonly<{ kind: 'saved'; text: string }> | Readonly<{ kind: 'failed' }> | null;
/** The latest outcome in "Rates you still need": a status, or an alert for a failed fetch. */
type LiveLine = Readonly<{ role: 'status' | 'alert'; lines: readonly string[] }> | null;

const wallClock = (): string => new Date().toISOString();
export const SAVED_RATES_SHOWN = 20;
export const MISSING_RATES_SHOWN = 20;
const RATE_INVALID = 'Use a number above 0, such as 1.146 or 0.0055, with at most 12 digits before and after the point.';
const RATE_NOT_SAVED = 'Kairos could not save your rate. Nothing was changed.';

interface RateFormProps {
  readonly db: KairosDatabase;
  readonly now: () => string;
  readonly from: string;
  readonly to: string;
  readonly day: string;
  readonly label: string;
  readonly initialRate: string;
  readonly buttonText: string;
  readonly buttonLabel: string;
  readonly onSaved: (record: ExchangeRateRecord) => void;
}

/** One typed rate for a pair and day: a missing rate, or a change to one the trader typed (same id, so only the typed row is replaced). */
function RateForm({ db, now, from, to, day, label, initialRate, buttonText, buttonLabel, onSaved }: RateFormProps) {
  const [rate, setRate] = useState(initialRate);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const result = await saveTypedExchangeRate(db, { from, to, day, rate }, { now });
    setSaving(false);
    if (result.ok) { setError(undefined); onSaved(result.record); return; }
    setError(result.type === 'validation-error' && result.reason === 'rate-invalid' ? RATE_INVALID : RATE_NOT_SAVED);
    input.current?.focus();
  }
  return <form noValidate onSubmit={save}>
    <Field label={label} error={error}>
      {control => <input {...control} ref={input} inputMode="decimal" autoComplete="off" spellCheck={false} value={rate} onChange={event => setRate(event.target.value)} />}
    </Field>
    <Button type="submit" size="sm" busy={saving} aria-label={buttonLabel}>{buttonText}</Button>
  </form>;
}

export function CurrencyScreen({ db, rates, now = wallClock }: CurrencyScreenProps) {
  const homeId = useId();
  const missingId = useId();
  const ratesId = useId();
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [reload, setReload] = useState(0);
  const [currency, setCurrency] = useState('');
  const [coins, setCoins] = useState<readonly UsdStablecoin[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<SaveMessage>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [missingLine, setMissingLine] = useState<LiveLine>(null);
  const [changedLine, setChangedLine] = useState<string | null>(null);
  const formFilled = useRef(false);
  const focusMissingAfterLoad = useRef(false);
  const focusSavedAfterLoad = useRef(false);
  const missingHeading = useRef<HTMLHeadingElement>(null);
  const savedHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { formFilled.current = false; }, [db]);
  useEffect(() => {
    let ignore = false;
    Promise.all([loadHomeCurrency(db), listSavedExchangeRates(db), loadMissingExchangeRates(db)]).then(
      ([home, saved, missing]) => {
        if (ignore) return;
        if (!formFilled.current) {
          formFilled.current = true;
          setCurrency(home?.currency ?? '');
          setCoins(home?.usdStablecoins ?? []);
        }
        setState({ kind: 'ready', home, rates: saved, missing: missing.missing });
      },
      () => { if (!ignore) setState({ kind: 'failed' }); },
    );
    return () => { ignore = true; };
  }, [db, reload]);
  useEffect(() => {
    if (state.kind !== 'ready') return;
    if (focusMissingAfterLoad.current) { focusMissingAfterLoad.current = false; missingHeading.current?.focus(); }
    if (focusSavedAfterLoad.current) { focusSavedAfterLoad.current = false; savedHeading.current?.focus(); }
  }, [state]);

  const reloadThenFocusMissing = () => { focusMissingAfterLoad.current = true; setReload(count => count + 1); };
  const toggleCoin = (coin: UsdStablecoin, checked: boolean) =>
    setCoins(current => USD_STABLECOINS.filter(each => (each === coin ? checked : current.includes(each))));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const result = await saveHomeCurrency(db, { currency, usdStablecoins: coins }, { now });
    setSaving(false);
    if (result.ok) {
      setMessage({ kind: 'saved', text: describeHomeCurrencySaved(result.preference?.currency ?? null) });
      setReload(count => count + 1);
    } else setMessage({ kind: 'failed' });
  }

  async function fetchRates(missing: readonly MissingExchangeRate[]) {
    setFetching(true);
    setChangedLine(null);
    setMissingLine({ role: 'status', lines: ['Getting rates…'] });
    const result = await fetchMissingEcbRates(db, rates, missing, { now: now() });
    const words = describeEcbFetchResult(result);
    setFetching(false);
    setFetchFailed(!result.ok && result.reason === 'unavailable');
    setMissingLine({ role: words.tone === 'success' ? 'status' : 'alert', lines: words.lines });
    reloadThenFocusMissing();
  }

  const onMissingSaved = (record: ExchangeRateRecord) => {
    setChangedLine(null);
    setMissingLine({ role: 'status', lines: [describeTypedRateSaved(record)] });
    reloadThenFocusMissing();
  };
  const onChangedSaved = (record: ExchangeRateRecord) => {
    setMissingLine(null);
    setChangedLine(describeTypedRateSaved(record));
    focusSavedAfterLoad.current = true;
    setReload(count => count + 1);
  };

  const missingCard = (home: string, missing: readonly MissingExchangeRate[]) => {
    const n = missing.length;
    return <Card as="section" className="kairos-currency-card" aria-labelledby={missingId}>
      <h2 id={missingId} ref={missingHeading} tabIndex={-1}>Rates you still need</h2>
      {missingLine !== null ? <div role={missingLine.role}>{missingLine.lines.map(line => <p key={line}>{line}</p>)}</div> : null}
      {n === 0 ? <p>{`No rates missing: every trade with a result and a currency counts in ${home}.`}</p> : <>
        <p>{`${n} ${n === 1 ? 'rate is' : 'rates are'} missing. Kairos needs one for each currency and each day a trade closed.`}</p>
        {ecbRateNeeds(missing).length > 0 ? <>
          <Button busy={fetching} onClick={() => { void fetchRates(missing); }}>{fetchFailed ? 'Try again' : 'Get rates from the European Central Bank'}</Button>
          <p>This needs a connection. Kairos sends the bank only the currency codes and dates it needs, and saves its published rates on this device. For a weekend or one of the bank's holidays, Kairos uses its last rate before that day.</p>
        </> : null}
        <ul className="kairos-currency-rates">
          {missing.slice(0, MISSING_RATES_SHOWN).map(m => <li key={`${m.from}:${m.to}:${m.day}`}>
            <p>{describeMissingRate(m)}</p>
            {!ecbCanProvideRate(m.from, m.to) ? <p>{`The European Central Bank publishes no rate for ${m.from}, so type yours.`}</p> : null}
            <RateForm db={db} now={now} from={m.from} to={m.to} day={m.day} label={missingRateLabel(m)} initialRate=""
              buttonText="Save rate" buttonLabel={missingRateSaveLabel(m)} onSaved={onMissingSaved} />
          </li>)}
        </ul>
        {n > MISSING_RATES_SHOWN ? <p>{`Showing the ${MISSING_RATES_SHOWN} newest of ${n} missing rates.`}</p> : null}
      </>}
    </Card>;
  };

  return <section className="kairos-route kairos-currency" aria-labelledby="kairos-currency-title">
    <p className="kairos-currency__eyebrow">Your totals</p>
    <h1 id="kairos-currency-title" tabIndex={-1}>Your currency</h1>
    <p>
      Choose the one currency Kairos shows your totals in. Each trade keeps the currency you recorded, and its own result never changes: Kairos converts only totals, with the exchange rate of the day each trade closed (by the UTC clock). It never guesses a rate. Without one, a total that includes that trade can't be shown in your currency.
      {' '}<GlossaryHint termId="exchange-rate" label="Exchange rate" />
    </p>
    {state.kind === 'loading' ? <p>Loading your currency…</p> : null}
    {state.kind === 'failed' ? <p>Kairos could not load your currency. Your trades are not affected.</p> : null}
    {state.kind === 'ready' ? <>
      <Card as="section" className="kairos-currency-card" aria-labelledby={homeId}>
        <h2 id={homeId}>Your home currency</h2>
        <p>Kairos shows your daily results, your results over time, your patterns, and any goal or practice money set in this currency in it.</p>
        <form noValidate onSubmit={save}>
          <Field label="Show my totals in" id="kairos-currency-home" hint="The 30 currencies the European Central Bank publishes a daily rate for.">
            {control => <select {...control} value={currency} onChange={event => setCurrency(event.target.value)}>
              <option value="">Not chosen: keep each currency apart</option>
              {ECB_REFERENCE_CURRENCIES.map(code => <option key={code} value={code}>{describeCurrencyOption(code)}</option>)}
            </select>}
          </Field>
          <fieldset className="kairos-currency-coins">
            <legend>Coins counted as US dollars</legend>
            <p>USDT and USDC are coins meant to stay at 1 US dollar, but their price can move away from it. Tick one only if you accept 1 to 1 in your totals.</p>
            {USD_STABLECOINS.map(coin => <label key={coin}>
              <input type="checkbox" checked={coins.includes(coin)} onChange={event => toggleCoin(coin, event.target.checked)} /> Count {coin} as US dollars, 1 to 1
            </label>)}
          </fieldset>
          <Button type="submit" busy={saving}>Save my currency</Button>
          {message?.kind === 'saved' ? <p role="status">{message.text}</p> : null}
          {message?.kind === 'failed' ? <p role="alert">Kairos could not save your currency. Nothing was changed.</p> : null}
        </form>
      </Card>
      {state.home !== null ? missingCard(state.home.currency, state.missing) : null}
      <Card as="section" className="kairos-currency-card" aria-labelledby={ratesId}>
        <h2 id={ratesId} ref={savedHeading} tabIndex={-1}>Your saved rates</h2>
        {changedLine !== null ? <p role="status">{changedLine}</p> : null}
        {state.rates.length === 0 ? <p>No exchange rates saved yet.</p> : <>
          <ul className="kairos-currency-rates">
            {state.rates.slice(0, SAVED_RATES_SHOWN).map(r => <li key={r.id}>
              <p>{describeSavedRate(r)}</p>
              {r.source === 'typed' ? <RateForm key={r.rate} db={db} now={now} from={r.from} to={r.to} day={r.day}
                label={`1 ${r.from} in ${r.to} on ${currencyDayLabel(r.day)}`} initialRate={r.rate} buttonText="Change rate"
                buttonLabel={`Change rate for ${r.from} to ${r.to}, ${currencyDayLabel(r.day)}`} onSaved={onChangedSaved} /> : null}
            </li>)}
          </ul>
          {state.rates.length > SAVED_RATES_SHOWN ? <p>{`Showing your ${SAVED_RATES_SHOWN} newest rates of ${state.rates.length}.`}</p> : null}
        </>}
      </Card>
    </> : null}
  </section>;
}
