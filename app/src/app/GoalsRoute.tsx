import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { loadHomeCurrency } from '../application/currency/homeCurrency';
import {
  EMPTY_GOALS_PREFERENCE, goalsPreferenceInputOf, loadGoalsProgress, saveGoalsPreference, type GoalsPreference, type GoalsPreferenceInvalidReason, type GoalsProgressQueryResult,
} from '../application/goals';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import { createKairosRepositories } from '../data/repositories';
import { Button, Card, Field, PageHeader } from '../design-system/primitives';
import { DeviceTimeZoneButton } from '../features/settings/DeviceTimeZoneButton';
import { GoalsProgress } from '../features/discipline/GoalsProgressCard';
import '../features/discipline/goals.css';

interface GoalsRouteProps {
  readonly db?: KairosDatabase;
  /** The current instant as a canonical UTC ISO string; tests inject a fixed one. */
  readonly now?: () => string;
}

type State =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'error' }>
  | Readonly<{ kind: 'ready'; result: GoalsProgressQueryResult }>;

type Feedback = Readonly<{ kind: 'success' | 'error'; message: string }> | null;

/** A stable default clock: a fresh function per render would restart the load effect on every keystroke. */
const wallClock = (): string => new Date().toISOString();

const invalidText = (reason: GoalsPreferenceInvalidReason): string => {
  switch (reason) {
    case 'trades-per-month-invalid': return 'Trades per month must be a whole number from 1 to 10000, or left blank.';
    case 'max-trades-per-day-invalid': return 'Most trades in a day must be a whole number from 1 to 10000, or left blank.';
    case 'monthly-result-target-amount-invalid': return 'The monthly result target must be a positive amount, such as 250 or 99.50.';
    case 'monthly-result-target-currency-invalid': return 'Enter the currency code of the result target, such as USDT or USD.';
    case 'loss-limit-per-day-invalid': return 'The most you can lose in a day must be an amount above 0, such as 100 or 49.50, or left blank.';
    case 'loss-limit-per-week-invalid': return 'The most you can lose in a week must be an amount above 0, such as 250, or left blank.';
    case 'loss-limit-currency-invalid': return 'Type the currency of your loss limits, such as USDT or USD.';
    case 'loss-limit-week-below-day': return "The most for a week can't be less than the most for a day.";
  }
};

/** The form's fields; with no loss limit saved, its currency starts as the home currency (D247). */
const fields = (preference: GoalsPreference, homeCurrency: string | null) => {
  const input = goalsPreferenceInputOf(preference);
  return { ...input, lossLimitCurrency: preference.lossLimits === null ? homeCurrency ?? '' : input.lossLimitCurrency };
};
type Form = ReturnType<typeof fields>;
type TextField = { [K in keyof Form]: Form[K] extends string ? K : never }[keyof Form];

/** Goals: user-set targets persisted as a P5 preference, progress projected read-only from released journal truth. */
export function GoalsRoute({ db = kairosDatabase, now = wallClock }: GoalsRouteProps) {
  const repositories = useMemo(() => createKairosRepositories(db), [db]);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [form, setForm] = useState<Form>(() => fields(EMPTY_GOALS_PREFERENCE, null));
  const [homeCurrency, setHomeCurrency] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const seeded = useRef(false);

  const load = useCallback(async (ignore: () => boolean) => {
    try {
      const [result, home] = await Promise.all([loadGoalsProgress(db, now()), loadHomeCurrency(db).catch(() => null)]);
      if (ignore()) return;
      setState({ kind: 'ready', result });
      setHomeCurrency(home?.currency ?? null);
      // The form is seeded from storage once; later loads only refresh the progress cards.
      if (!seeded.current) { seeded.current = true; setForm(fields(result.preference, home?.currency ?? null)); }
    } catch {
      if (!ignore()) setState({ kind: 'error' });
    }
  }, [db, now]);

  useEffect(() => {
    let ignored = false;
    void load(() => ignored);
    return () => { ignored = true; };
  }, [load, revision]);

  async function handleSubmit(event: FormEvent<HTMLElement>): Promise<void> {
    event.preventDefault();
    if (isSaving) return;
    setFeedback(null); setIsSaving(true);
    try {
      const result = await saveGoalsPreference(db, form, { now });
      if (!result.ok) { setFeedback({ kind: 'error', message: invalidText(result.reason) }); return; }
      setForm(fields(result.preference, homeCurrency));
      setFeedback({ kind: 'success', message: 'Goals saved.' });
      setRevision(value => value + 1);
    } catch {
      setFeedback({ kind: 'error', message: 'Kairos could not save your goals. Your stored goals were not changed.' });
    } finally {
      setIsSaving(false);
    }
  }
  const field = (name: TextField) => (event: { target: { value: string } }) => { setForm(current => ({ ...current, [name]: event.target.value })); setFeedback(null); };
  const toggle = (name: 'reviewEveryTrade' | 'tickEveryStep') => () => { setForm(current => ({ ...current, [name]: !current[name] })); setFeedback(null); };
  const lossCurrency = form.lossLimitCurrency.trim().toUpperCase();
  const otherCurrency = homeCurrency !== null && lossCurrency !== '' && lossCurrency !== homeCurrency && (form.lossLimitPerDay.trim() !== '' || form.lossLimitPerWeek.trim() !== '');
  const busy = state.kind === 'loading' || isSaving;

  return <section className="kairos-route kairos-goals" aria-labelledby="kairos-goals-title" data-goals-status={state.kind === 'ready' ? state.result.kind : state.kind}>
    <PageHeader eyebrow="Discipline" title="Goals" titleId="kairos-goals-title" />
    {state.kind === 'loading' ? <p className="kairos-goals__note">Loading your goals…</p> : null}
    {state.kind === 'error' ? <p role="alert">Kairos could not load your goals.</p> : null}
    {state.kind === 'ready' && state.result.kind === 'time-zone-unconfigured' ? <p className="kairos-goals__unconfigured" role="status">Goals follow your daily-results calendar. <Link to="/settings">Set your time zone in Settings</Link> first.</p> : null}
    {state.kind === 'ready' && state.result.kind === 'time-zone-unconfigured' ? <DeviceTimeZoneButton metadata={repositories.metadata} onSaved={() => { void load(() => false); }} /> : null}
    {state.kind === 'ready' && state.result.kind === 'ready' ? <GoalsProgress progress={state.result.progress} inHomeCurrency={state.result.inHomeCurrency} /> : null}
    <Card as="form" className="kairos-goals-card kairos-goals__form" onSubmit={handleSubmit} noValidate>
      <div><h2>Your targets</h2><p>Leave a field blank to keep no target. Targets are yours to change any time; they never alter your journal.</p></div>
      <Field label="Closed trades per month" id="kairos-goals-trades-per-month">{control => <input {...control} inputMode="numeric" value={form.tradesPerMonthTarget} onChange={field('tradesPerMonthTarget')} placeholder="20" autoComplete="off" disabled={busy} />}</Field>
      <Field label="Most trades in a day" id="kairos-goals-max-trades-per-day">{control => <input {...control} inputMode="numeric" value={form.maxTradesPerDay} onChange={field('maxTradesPerDay')} placeholder="3" autoComplete="off" disabled={busy} />}</Field>
      <div className="kairos-goals-field__pair">
        <Field label="Monthly result target" id="kairos-goals-monthly-result-amount">{control => <input {...control} inputMode="decimal" value={form.monthlyResultTargetAmount} onChange={field('monthlyResultTargetAmount')} placeholder="250" autoComplete="off" disabled={busy} />}</Field>
        <Field label="Currency" id="kairos-goals-monthly-result-currency">{control => <input {...control} value={form.monthlyResultTargetCurrency} onChange={field('monthlyResultTargetCurrency')} placeholder="USDT" autoComplete="off" spellCheck={false} disabled={busy} />}</Field>
      </div>
      <div><h2>Your limits</h2><p id="kairos-goals-limits-hint">Counted from the trades you close, after fees. A week runs Monday to Sunday. Open trades count when they close.</p></div>
      <div className="kairos-goals-field__pair">
        <Field label="Most I can lose in a day" id="kairos-goals-loss-per-day">{control => <input {...control} inputMode="decimal" value={form.lossLimitPerDay} onChange={field('lossLimitPerDay')} placeholder="100" autoComplete="off" disabled={busy} />}</Field>
        <Field label="Most I can lose in a week" id="kairos-goals-loss-per-week">{control => <input {...control} inputMode="decimal" value={form.lossLimitPerWeek} onChange={field('lossLimitPerWeek')} placeholder="250" autoComplete="off" disabled={busy} />}</Field>
      </div>
      <Field label="Currency of your loss limits" id="kairos-goals-loss-currency" hint={otherCurrency ? `Your totals are in ${homeCurrency}. A limit in ${lossCurrency} counts only trades with results in ${lossCurrency}.` : undefined}>
        {control => <input {...control} value={form.lossLimitCurrency} onChange={field('lossLimitCurrency')} placeholder="USDT" autoComplete="off" spellCheck={false} disabled={busy} />}
      </Field>
      <div><h2>Your habits</h2></div>
      <label className="kairos-goals-check">
        <input type="checkbox" name="reviewEveryTrade" checked={form.reviewEveryTrade} onChange={toggle('reviewEveryTrade')} disabled={busy} aria-describedby="kairos-goals-review-hint" />
        <span>Review every trade<span className="kairos-goals-check__hint" id="kairos-goals-review-hint">Every trade you close gets its "After the trade" review.</span></span>
      </label>
      <label className="kairos-goals-check">
        <input type="checkbox" name="tickEveryStep" checked={form.tickEveryStep} onChange={toggle('tickEveryStep')} disabled={busy} aria-describedby="kairos-goals-tick-hint" />
        <span>Tick every step<span className="kairos-goals-check__hint" id="kairos-goals-tick-hint">Every trade has its "Before you trade" checklist with every step ticked. A trade logged after it closed has no checklist, so it counts as not ticked.</span></span>
      </label>
      <div className="kairos-goals-card__actions"><Button type="submit" disabled={busy}>{isSaving ? 'Saving…' : 'Save goals'}</Button></div>
      {feedback ? <p className={`kairos-goals-card__feedback kairos-goals-card__feedback--${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.message}</p> : null}
    </Card>
  </section>;
}
