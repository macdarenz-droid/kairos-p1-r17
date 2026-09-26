import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { loadGoalsProgress, writeGoalsPreference, type GoalsPreference, type GoalsPreferenceInvalidReason, type GoalsProgressProjection, type GoalsProgressQueryResult } from '../application/goals';
import { describeTotalsInHomeCurrency } from '../application/currency/currencyWords';
import type { ResultsInHomeCurrencySummary } from '../application/currency/resultsInHomeCurrency';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import { createKairosRepositories } from '../data/repositories';
import { Button, Card, Field } from '../design-system/primitives';
import { DeviceTimeZoneButton } from '../features/settings/DeviceTimeZoneButton';
import './goalsRoute.css';

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
    case 'max-trades-per-day-invalid': return 'Max trades per day must be a whole number from 1 to 10000, or left blank.';
    case 'monthly-result-target-amount-invalid': return 'The monthly result target must be a positive amount, such as 250 or 99.50.';
    case 'monthly-result-target-currency-invalid': return 'Enter the currency code of the result target, such as USDT or USD.';
  }
};

const fields = (preference: GoalsPreference) => ({
  tradesPerMonthTarget: preference.tradesPerMonthTarget === null ? '' : String(preference.tradesPerMonthTarget),
  maxTradesPerDay: preference.maxTradesPerDay === null ? '' : String(preference.maxTradesPerDay),
  monthlyResultTargetAmount: preference.monthlyResultTarget === null ? '' : preference.monthlyResultTarget.amount,
  monthlyResultTargetCurrency: preference.monthlyResultTarget === null ? '' : preference.monthlyResultTarget.currency,
});

function Progress({ progress, inHomeCurrency }: { readonly progress: GoalsProgressProjection; readonly inHomeCurrency: ResultsInHomeCurrencySummary | null }) {
  if (progress.kind !== 'ready') return <p role="alert" data-goals-progress="unavailable">{progress.reason === 'invalid-time-zone' ? 'Your daily-results time zone is not valid. Fix it in Settings.' : 'The current time could not be read.'}</p>;
  const { tradesPerMonth, maxTradesPerDay, monthlyResult } = progress;
  const homeWords = describeTotalsInHomeCurrency(inHomeCurrency);
  return <div className="kairos-goals__progress" data-goals-progress="ready" data-goals-month={progress.monthKey} data-goals-today={progress.todayKey}>
    <Card as="article" className="kairos-goals-card" data-goal="trades-per-month" data-goal-state={tradesPerMonth.kind === 'unset' ? 'unset' : tradesPerMonth.reached ? 'reached' : 'progress'}>
      <h2>Closed trades this month</h2>
      {tradesPerMonth.kind === 'unset' ? <p>No target set.</p> : <p><strong>{tradesPerMonth.current}</strong> of {tradesPerMonth.target} · {tradesPerMonth.reached ? 'target reached' : `${tradesPerMonth.target - tradesPerMonth.current} to go`}</p>}
    </Card>
    <Card as="article" className="kairos-goals-card" data-goal="max-trades-per-day" data-goal-state={maxTradesPerDay.kind === 'unset' ? 'unset' : maxTradesPerDay.exceeded ? 'exceeded' : maxTradesPerDay.remaining === 0 ? 'at-limit' : 'within'}>
      <h2>Trades opened today</h2>
      {maxTradesPerDay.kind === 'unset' ? <p>No limit set.</p> : <p><strong>{maxTradesPerDay.today}</strong> of {maxTradesPerDay.limit} allowed · {maxTradesPerDay.exceeded ? 'over your limit' : maxTradesPerDay.remaining === 0 ? 'at your limit' : `${maxTradesPerDay.remaining} left`}</p>}
    </Card>
    <Card as="article" className="kairos-goals-card" data-goal="monthly-result" data-goal-state={monthlyResult.kind === 'unset' ? 'unset' : monthlyResult.kind === 'unavailable' ? 'unavailable' : monthlyResult.reached ? 'reached' : 'progress'}>
      <h2>Result this month</h2>
      {monthlyResult.kind === 'unset' ? <p>No result target set.</p>
        : monthlyResult.kind === 'unavailable' ? <p>Target {monthlyResult.target} {monthlyResult.currency} · {monthlyResult.reason === 'no-comparable-days' ? `no closed trade this month has a result in ${monthlyResult.currency} yet` : 'the month total could not be added'}{monthlyResult.incompleteDays > 0 ? ` (${monthlyResult.incompleteDays} ${monthlyResult.incompleteDays === 1 ? 'day' : 'days'} in another currency or without a result)` : ''}.</p>
        : <p><strong>{monthlyResult.current}</strong> of {monthlyResult.target} {monthlyResult.currency} · {monthlyResult.reached ? 'target reached' : `${monthlyResult.remaining} to go`}{monthlyResult.incompleteDays > 0 ? ` (${monthlyResult.incompleteDays} ${monthlyResult.incompleteDays === 1 ? 'day' : 'days'} in another currency or without a result)` : ''}</p>}
    </Card>
    <p className="kairos-goals__note">Counted from all your trades this month ({progress.monthKey}, time zone {progress.timeZone}). Results are your recorded results after fees, never estimates.</p>
    {homeWords ? <p className="kairos-goals__note">{homeWords.text} <Link to="/currency">{homeWords.link}</Link></p> : null}
  </div>;
}

/** Goals: user-set targets persisted as a P5 preference, progress projected read-only from released journal truth. */
export function GoalsRoute({ db = kairosDatabase, now = wallClock }: GoalsRouteProps) {
  const repositories = useMemo(() => createKairosRepositories(db), [db]);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [form, setForm] = useState(fields({ tradesPerMonthTarget: null, maxTradesPerDay: null, monthlyResultTarget: null }));
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const seeded = useRef(false);

  const load = useCallback(async (ignore: () => boolean) => {
    try {
      const result = await loadGoalsProgress(db, now());
      if (ignore()) return;
      setState({ kind: 'ready', result });
      // The form is seeded from storage once; later loads only refresh the progress cards.
      if (!seeded.current) { seeded.current = true; setForm(fields(result.preference)); }
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
      const result = await writeGoalsPreference(repositories.metadata, form, now());
      if (!result.ok) { setFeedback({ kind: 'error', message: invalidText(result.reason) }); return; }
      setForm(fields(result.preference));
      setFeedback({ kind: 'success', message: 'Goals saved.' });
      setRevision(value => value + 1);
    } catch {
      setFeedback({ kind: 'error', message: 'Kairos could not save your goals. Your stored goals were not changed.' });
    } finally {
      setIsSaving(false);
    }
  }
  const field = (name: keyof typeof form) => (event: { target: { value: string } }) => { setForm(current => ({ ...current, [name]: event.target.value })); setFeedback(null); };
  const busy = state.kind === 'loading' || isSaving;

  return <section className="kairos-route kairos-goals" aria-labelledby="kairos-goals-title" data-goals-status={state.kind === 'ready' ? state.result.kind : state.kind}>
    <div className="kairos-goals__heading"><div><p className="kairos-goals__eyebrow">Discipline</p><h1 id="kairos-goals-title">Goals</h1></div></div>
    {state.kind === 'loading' ? <p className="kairos-goals__note">Loading your goals…</p> : null}
    {state.kind === 'error' ? <p role="alert">Kairos could not load your goals.</p> : null}
    {state.kind === 'ready' && state.result.kind === 'time-zone-unconfigured' ? <p className="kairos-goals__unconfigured" role="status">Goals follow your daily-results calendar. <Link to="/settings">Set your time zone in Settings</Link> first.</p> : null}
    {state.kind === 'ready' && state.result.kind === 'time-zone-unconfigured' ? <DeviceTimeZoneButton metadata={repositories.metadata} onSaved={() => { void load(() => false); }} /> : null}
    {state.kind === 'ready' && state.result.kind === 'ready' ? <Progress progress={state.result.progress} inHomeCurrency={state.result.inHomeCurrency} /> : null}
    <Card as="form" className="kairos-goals-card kairos-goals__form" onSubmit={handleSubmit} noValidate>
      <div><h2>Your targets</h2><p>Leave a field blank to keep no target. Targets are yours to change any time; they never alter your journal.</p></div>
      <Field label="Closed trades per month" id="kairos-goals-trades-per-month">{control => <input {...control} inputMode="numeric" value={form.tradesPerMonthTarget} onChange={field('tradesPerMonthTarget')} placeholder="20" autoComplete="off" disabled={busy} />}</Field>
      <Field label="Max trades per day" id="kairos-goals-max-trades-per-day">{control => <input {...control} inputMode="numeric" value={form.maxTradesPerDay} onChange={field('maxTradesPerDay')} placeholder="3" autoComplete="off" disabled={busy} />}</Field>
      <div className="kairos-goals-field__pair">
        <Field label="Monthly result target" id="kairos-goals-monthly-result-amount">{control => <input {...control} inputMode="decimal" value={form.monthlyResultTargetAmount} onChange={field('monthlyResultTargetAmount')} placeholder="250" autoComplete="off" disabled={busy} />}</Field>
        <Field label="Currency" id="kairos-goals-monthly-result-currency">{control => <input {...control} value={form.monthlyResultTargetCurrency} onChange={field('monthlyResultTargetCurrency')} placeholder="USDT" autoComplete="off" spellCheck={false} disabled={busy} />}</Field>
      </div>
      <div className="kairos-goals-card__actions"><Button type="submit" disabled={busy}>{isSaving ? 'Saving…' : 'Save goals'}</Button></div>
      {feedback ? <p className={`kairos-goals-card__feedback kairos-goals-card__feedback--${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.message}</p> : null}
    </Card>
  </section>;
}
