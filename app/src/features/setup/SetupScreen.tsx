import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { loadHomeCurrency, saveHomeCurrency, type HomeCurrencyPreference } from '../../application/currency/homeCurrency';
import { suggestHomeCurrency } from '../../application/currency/homeCurrencySuggestion';
import { loadDisciplineLists, saveDisciplineLists } from '../../application/discipline';
import { loadGoalsPreference, saveGoalsPreference, type GoalsPreference } from '../../application/goals';
import { finishSetup, skipSetup } from '../../application/setup/setupState';
import { loadTradedMarkets, saveTradedMarkets, TRADED_MARKET_TYPES } from '../../application/setup/tradedMarkets';
import { loadVisualPnlTimeZone, saveVisualPnlTimeZone } from '../../application/visual-pnl';
import type { KairosDatabase } from '../../data/database';
import { ECB_REFERENCE_CURRENCIES } from '../../domain/calculations/currencyConversion';
import type { DisciplineListItem, DisciplineListKind, DisciplineLists } from '../../domain/discipline';
import type { MarketType } from '../../domain/trades';
import { Button, Card, Field, PageHeader, Select } from '../../design-system/primitives';
import { LOG_TRADE_ADDRESS } from './GettingStartedCard';
import './setup.css';

export interface SetupScreenProps {
  readonly db: KairosDatabase;
  /** This phone's time zone (null when it reports none); the route reads it. */
  readonly deviceTimeZone: string | null;
  /** The phone's languages, first first (`navigator.languages`), for the home-currency suggestion. */
  readonly languages: readonly string[];
  /** The current instant (UTC ISO); tests inject a fixed one. */
  readonly now?: () => string;
}

const STEPS = 6;
const TITLE = 'kairos-setup-title';
const STEP_TITLE = 'kairos-setup-step-title';
const ZONE_FIELD = 'kairos-setup-time-zone';
const wallClock = (): string => new Date().toISOString();

const MARKET_WORDS: Readonly<Record<MarketType, string>> = Object.freeze({ crypto: 'Crypto', forex: 'Forex', stock: 'Stocks', futures: 'Futures', options: 'Options', other: 'Other' });
const LIST_GROUPS: readonly { readonly kind: DisciplineListKind; readonly legend: string }[] = [
  { kind: 'checklist', legend: 'Before you trade: your steps' },
  { kind: 'review', legend: 'After the trade: your questions' },
  { kind: 'mistakes', legend: 'Mistakes you can tag' },
];

interface Saved {
  readonly timeZone: string | null;
  readonly currency: HomeCurrencyPreference | null;
  readonly markets: readonly MarketType[] | null;
  readonly lists: DisciplineLists;
  readonly goals: GoalsPreference;
}

/** A failed load stays on screen while "Try again" reads again (`retrying`), so the button keeps focus. */
type Loaded = Readonly<{ kind: 'loading' }> | Readonly<{ kind: 'error'; retrying: boolean }> | Readonly<{ kind: 'ready'; saved: Saved }>;

/** The step the address asks for (`?step=N`, from the Getting started card), else the first. */
function stepFrom(params: URLSearchParams): number {
  const asked = Number.parseInt(params.get('step') ?? '', 10);
  return Number.isInteger(asked) && asked >= 1 && asked <= STEPS ? asked : 1;
}

/** What each step shows and saves; a step answers true when it may move on. */
interface StepForm {
  readonly title: string;
  readonly body: ReactNode;
  readonly save: () => Promise<boolean>;
}

/**
 * T-053d (D222): the 2-minute setup, one step at a time. Each step saves through the owner of its value; "Skip for
 * now" saves only that it was skipped. It can be opened again from More › App, showing what is saved.
 */
export function SetupScreen({ db, deviceTimeZone, languages, now = wallClock }: SetupScreenProps) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(() => stepFrom(params));
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  // What could not be saved, so "Try again" repeats it; the message stays while it retries, so focus stays on it.
  const [failed, setFailed] = useState<'next' | 'skip' | null>(null);
  const [busy, setBusy] = useState(false);
  // Each change of step (never the first screen: the shell focuses the page's h1) moves focus to the step's heading.
  const [titleFocus, setTitleFocus] = useState(0);
  const retried = useRef(false);
  const zoneAsked = useRef(false);

  // Each step's answer, kept while the trader moves back and forth.
  const [zone, setZone] = useState('');
  const [changingZone, setChangingZone] = useState(false);
  const [currency, setCurrency] = useState('');
  const [markets, setMarkets] = useState<readonly MarketType[]>([]);
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  const [goals, setGoals] = useState({ tradesPerMonthTarget: '', maxTradesPerDay: '', monthlyResultTargetAmount: '', monthlyResultTargetCurrency: '' });
  const suggestion = suggestHomeCurrency(languages);

  useEffect(() => {
    let ignore = false;
    setLoaded(current => (current.kind === 'error' ? { kind: 'error', retrying: true } : { kind: 'loading' }));
    Promise.all([loadVisualPnlTimeZone(db), loadHomeCurrency(db), loadTradedMarkets(db), loadDisciplineLists(db), loadGoalsPreference(db)]).then(
      ([timeZone, home, traded, lists, goal]) => {
        if (ignore) return;
        if (!lists.ok) { setLoaded({ kind: 'error', retrying: false }); return; }
        const saved: Saved = { timeZone, currency: home, markets: traded, lists: lists.lists, goals: goal };
        setLoaded({ kind: 'ready', saved });
        // After "Try again" its message is gone, so focus goes to the step.
        if (retried.current) { retried.current = false; setTitleFocus(value => value + 1); }
        setZone(timeZone ?? deviceTimeZone ?? '');
        setChangingZone(timeZone === null && deviceTimeZone === null);
        setCurrency(home?.currency ?? suggestion ?? '');
        setMarkets(traded ?? []);
        setKept(new Set(LIST_GROUPS.flatMap(group => lists.lists[group.kind].map(item => `${group.kind}:${item.id}`))));
        setGoals({
          tradesPerMonthTarget: goal.tradesPerMonthTarget === null ? '' : String(goal.tradesPerMonthTarget),
          maxTradesPerDay: goal.maxTradesPerDay === null ? '' : String(goal.maxTradesPerDay),
          monthlyResultTargetAmount: goal.monthlyResultTarget?.amount ?? '',
          monthlyResultTargetCurrency: goal.monthlyResultTarget?.currency ?? home?.currency ?? suggestion ?? '',
        });
      },
      () => { if (!ignore) setLoaded({ kind: 'error', retrying: false }); },
    );
    return () => { ignore = true; };
    // The phone's zone and languages are read once by the route; a retry reads the saved values again.
  }, [db, attempt]);

  // Focus moves in the same commit that shows the new step, so it is never left on the old one for a moment.
  useLayoutEffect(() => {
    if (titleFocus > 0) document.getElementById(STEP_TITLE)?.focus();
  }, [titleFocus]);

  // "Change" gives way to the time zone field, which takes the focus.
  useLayoutEffect(() => {
    if (!changingZone || !zoneAsked.current) return;
    zoneAsked.current = false;
    document.getElementById(ZONE_FIELD)?.focus();
  }, [changingZone]);

  // Reaching the last step finishes the setup (the first time is kept).
  useEffect(() => {
    if (step === STEPS) void finishSetup(db, { now });
  }, [db, now, step]);

  const go = (next: number) => { setProblem(null); setFailed(null); setStep(next); setTitleFocus(value => value + 1); };
  const saved = loaded.kind === 'ready' ? loaded.saved : null;

  async function next(form: StepForm): Promise<void> {
    if (busy) return;
    setBusy(true); setProblem(null);
    try {
      if (await form.save()) { go(step + 1); return; }
      // A step that answers with a problem replaces "Try again"; focus goes back to the step.
      if (failed !== null) { setFailed(null); setTitleFocus(value => value + 1); }
    } catch {
      setFailed('next');
    } finally {
      setBusy(false);
    }
  }

  async function skip(): Promise<void> {
    if (busy) return;
    setBusy(true);
    const result = await skipSetup(db, { now });
    setBusy(false);
    if (!result.ok) { setFailed('skip'); return; }
    void navigate('/');
  }

  const toggle = <T,>(set: ReadonlySet<T>, value: T): ReadonlySet<T> => { const copy = new Set(set); if (copy.has(value)) copy.delete(value); else copy.add(value); return copy; };
  const listItems = (kind: DisciplineListKind): readonly DisciplineListItem[] => saved?.lists[kind] ?? [];

  const forms: Readonly<Record<number, StepForm>> = {
    1: {
      title: 'Your time zone',
      body: <>
        {zone !== '' && !changingZone ? <p>Kairos uses {saved?.timeZone !== null && saved?.timeZone !== undefined ? 'your saved' : "this phone's"} time zone: <strong>{zone}</strong>. Your days and months follow it.</p> : null}
        {changingZone ? <Field label="Time zone" id={ZONE_FIELD} hint="Your place, for example Asia/Manila, Europe/London or UTC.">
          {control => <input {...control} value={zone} autoComplete="off" onChange={event => setZone(event.target.value)} />}
        </Field> : <Button variant="secondary" size="sm" onClick={() => { zoneAsked.current = true; setChangingZone(true); }}>Change</Button>}
      </>,
      save: async () => {
        if (zone.trim() === '') { setProblem('Type your time zone, for example Asia/Manila.'); return false; }
        if (saved?.timeZone === zone.trim()) return true;
        const result = await saveVisualPnlTimeZone(db, zone.trim(), { now });
        if (!result.ok) { setProblem('Kairos does not know that time zone. Try one like Asia/Manila, Europe/London or UTC.'); return false; }
        return true;
      },
    },
    2: {
      title: 'Your home currency',
      body: <>
        <p>Your totals add up in this currency. Each trade keeps the currency you record.</p>
        <Field label="Home currency" id="kairos-setup-currency" hint={suggestion !== null && currency === suggestion ? `${suggestion}, from this phone's region` : undefined}>
          {control => <Select {...control} value={currency} placeholder="Not chosen" onChange={event => setCurrency(event.target.value)}
            options={ECB_REFERENCE_CURRENCIES.map(code => ({ value: code, label: code }))} />}
        </Field>
      </>,
      save: async () => {
        if (currency === '' || saved?.currency?.currency === currency) return true;
        const result = await saveHomeCurrency(db, { currency, usdStablecoins: saved?.currency?.usdStablecoins ?? [] }, { now });
        if (!result.ok) { if (result.type === 'storage-error') throw new Error('save'); setProblem('Choose one of the listed currencies.'); return false; }
        return true;
      },
    },
    3: {
      title: 'What you trade',
      body: <fieldset className="kairos-setup__choices">
        <legend>Choose every market you trade</legend>
        {TRADED_MARKET_TYPES.map(market => <label key={market} className="kairos-setup__choice">
          <input type="checkbox" checked={markets.includes(market)} onChange={() => setMarkets(current => TRADED_MARKET_TYPES.filter(item => (item === market ? !current.includes(item) : current.includes(item))))} />
          {MARKET_WORDS[market]}
        </label>)}
      </fieldset>,
      save: async () => {
        const result = await saveTradedMarkets(db, markets, { now });
        if (!result.ok) { if (result.type === 'storage-error') throw new Error('save'); setProblem('Choose at least one market.'); return false; }
        return true;
      },
    },
    4: {
      title: 'Your checklist',
      body: <>
        <p>Kairos asks these on your trade cards. Untick any you don't want. You can change them any time in Analysis › Discipline.</p>
        {LIST_GROUPS.map(group => <fieldset key={group.kind} className="kairos-setup__choices">
          <legend>{group.legend}</legend>
          {listItems(group.kind).map(item => <label key={item.id} className="kairos-setup__choice">
            <input type="checkbox" checked={kept.has(`${group.kind}:${item.id}`)} onChange={() => setKept(current => toggle(current, `${group.kind}:${item.id}`))} />
            {item.label}
          </label>)}
        </fieldset>)}
      </>,
      save: async () => {
        if (saved === null) return false;
        const pick = (kind: DisciplineListKind) => saved.lists[kind].filter(item => kept.has(`${kind}:${item.id}`));
        const result = await saveDisciplineLists(db, { checklist: pick('checklist'), review: pick('review'), mistakes: pick('mistakes') }, { now });
        if (!result.ok) { if (result.type === 'storage-error') throw new Error('save'); setProblem('Kairos could not keep those lists.'); return false; }
        return true;
      },
    },
    5: {
      title: 'Your first goal',
      body: <>
        <p>Set one or more, or leave them blank. You can change them on the Goals page.</p>
        <Field label="Trades a month" id="kairos-setup-trades-per-month">{control => <input {...control} inputMode="numeric" value={goals.tradesPerMonthTarget} onChange={event => setGoals(current => ({ ...current, tradesPerMonthTarget: event.target.value }))} />}</Field>
        <Field label="Most trades in a day" id="kairos-setup-max-per-day">{control => <input {...control} inputMode="numeric" value={goals.maxTradesPerDay} onChange={event => setGoals(current => ({ ...current, maxTradesPerDay: event.target.value }))} />}</Field>
        <div className="kairos-setup__pair">
          <Field label="Result target for the month" id="kairos-setup-result-target">{control => <input {...control} inputMode="decimal" value={goals.monthlyResultTargetAmount} onChange={event => setGoals(current => ({ ...current, monthlyResultTargetAmount: event.target.value }))} />}</Field>
          <Field label="Currency" id="kairos-setup-result-currency">{control => <input {...control} value={goals.monthlyResultTargetCurrency} autoCapitalize="characters" onChange={event => setGoals(current => ({ ...current, monthlyResultTargetCurrency: event.target.value }))} />}</Field>
        </div>
      </>,
      save: async () => {
        const typed = goals.tradesPerMonthTarget.trim() !== '' || goals.maxTradesPerDay.trim() !== '' || goals.monthlyResultTargetAmount.trim() !== '';
        if (!typed) return true;
        const input = { ...goals, monthlyResultTargetCurrency: goals.monthlyResultTargetAmount.trim() === '' ? '' : goals.monthlyResultTargetCurrency };
        const result = await saveGoalsPreference(db, input, { now });
        if (!result.ok) {
          setProblem(result.reason === 'monthly-result-target-currency-invalid' ? 'Type the result target\'s currency, such as USD or USDT.'
            : result.reason === 'monthly-result-target-amount-invalid' ? 'The result target must be a positive amount, such as 250.'
            : 'Use a whole number from 1 to 10000, or leave it blank.');
          return false;
        }
        return true;
      },
    },
    6: {
      title: "You're set",
      body: <>
        <p>Your setup is saved. Log a trade when you make one, or practise first with pretend money.</p>
        <p className="kairos-setup__finish">
          <Link className="kairos-button kairos-button--primary kairos-button--lg" to={LOG_TRADE_ADDRESS}>Log your first trade</Link>
          <Link className="kairos-button kairos-button--secondary kairos-button--lg" to="/practice">Try Practice first</Link>
        </p>
      </>,
      save: async () => true,
    },
  };
  const form = forms[step]!;

  return <section className="kairos-route kairos-setup" aria-labelledby={TITLE}>
    <PageHeader eyebrow={`Step ${step} of ${STEPS}`} title="Set up Kairos" titleId={TITLE} intro="Six short steps. You can skip the setup and come back to it from More." />
    {loaded.kind === 'loading' ? <p role="status">Loading your setup…</p> : null}
    {loaded.kind === 'error' ? <div role="alert" className="kairos-setup__problem"><p>Kairos could not load your setup. Nothing was changed.</p>
      <Button variant="secondary" aria-disabled={loaded.retrying || undefined} onClick={() => { if (loaded.retrying) return; retried.current = true; setAttempt(value => value + 1); }}>Try again</Button></div> : null}
    {loaded.kind === 'ready' ? <Card as="section" className="kairos-setup__step" aria-labelledby={STEP_TITLE}>
      <h2 id={STEP_TITLE} tabIndex={-1}>{form.title}</h2>
      {form.body}
      {problem !== null ? <p role="alert" className="kairos-setup__problem">{problem}</p> : null}
      {failed !== null ? <div role="alert" className="kairos-setup__problem"><p>Could not save. Nothing was changed.</p>
        <Button variant="secondary" aria-disabled={busy || undefined} onClick={() => { void (failed === 'skip' ? skip() : next(form)); }}>Try again</Button></div> : null}
      {step < STEPS ? <div className="kairos-setup__actions">
        {step > 1 ? <Button variant="secondary" onClick={() => go(step - 1)}>Back</Button> : null}
        <Button onClick={() => { void next(form); }} aria-disabled={busy || undefined}>{step === 2 && currency === '' ? 'Not now' : 'Next'}</Button>
        <Button variant="ghost" onClick={() => { void skip(); }}>Skip for now</Button>
      </div> : <div className="kairos-setup__actions"><Button variant="secondary" onClick={() => go(step - 1)}>Back</Button></div>}
    </Card> : null}
  </section>;
}
