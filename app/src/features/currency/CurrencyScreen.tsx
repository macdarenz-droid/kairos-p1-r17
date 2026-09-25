import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { loadHomeCurrency, saveHomeCurrency, type HomeCurrencyPreference } from '../../application/currency/homeCurrency';
import { listSavedExchangeRates } from '../../application/currency/exchangeRates';
import { describeCurrencyOption, describeHomeCurrencySaved, describeSavedRate } from '../../application/currency/currencyWords';
import { ECB_REFERENCE_CURRENCIES, USD_STABLECOINS, type ExchangeRateRecord, type UsdStablecoin } from '../../domain/calculations/currencyConversion';
import type { KairosDatabase } from '../../data/database';
import { Button, Card, Field } from '../../design-system/primitives';
import { GlossaryHint } from '../learn/GlossaryHint';
import './currency.css';

export interface CurrencyScreenProps {
  readonly db: KairosDatabase;
  /** The current instant (UTC ISO); tests inject a fixed one. */
  readonly now?: () => string;
}

type ScreenState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'failed' }>
  | Readonly<{ kind: 'ready'; home: HomeCurrencyPreference | null; rates: readonly ExchangeRateRecord[] }>;
type SaveMessage = Readonly<{ kind: 'saved'; text: string }> | Readonly<{ kind: 'failed' }> | null;

const wallClock = (): string => new Date().toISOString();
export const SAVED_RATES_SHOWN = 20;

export function CurrencyScreen({ db, now = wallClock }: CurrencyScreenProps) {
  const homeId = useId();
  const ratesId = useId();
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [reload, setReload] = useState(0);
  const [currency, setCurrency] = useState('');
  const [coins, setCoins] = useState<readonly UsdStablecoin[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<SaveMessage>(null);
  const formFilled = useRef(false);

  useEffect(() => { formFilled.current = false; }, [db]);
  useEffect(() => {
    let ignore = false;
    Promise.all([loadHomeCurrency(db), listSavedExchangeRates(db)]).then(
      ([home, rates]) => {
        if (ignore) return;
        if (!formFilled.current) {
          formFilled.current = true;
          setCurrency(home?.currency ?? '');
          setCoins(home?.usdStablecoins ?? []);
        }
        setState({ kind: 'ready', home, rates });
      },
      () => { if (!ignore) setState({ kind: 'failed' }); },
    );
    return () => { ignore = true; };
  }, [db, reload]);

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
      <Card as="section" className="kairos-currency-card" aria-labelledby={ratesId}>
        <h2 id={ratesId}>Your saved rates</h2>
        {state.rates.length === 0 ? <p>No exchange rates saved yet.</p> : <>
          <ul className="kairos-currency-rates">
            {state.rates.slice(0, SAVED_RATES_SHOWN).map(rate => <li key={rate.id}>{describeSavedRate(rate)}</li>)}
          </ul>
          {state.rates.length > SAVED_RATES_SHOWN ? <p>{`Showing your ${SAVED_RATES_SHOWN} newest rates of ${state.rates.length}.`}</p> : null}
        </>}
      </Card>
    </> : null}
  </section>;
}
