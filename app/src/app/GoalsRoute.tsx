import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { loadGoalsProgress, writeGoalsPreference, type GoalsPreference, type GoalsPreferenceInvalidReason, type GoalsProgressQueryResult } from '../application/goals';
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
    <PageHeader eyebrow="Discipline" title="Goals" titleId="kairos-goals-title" />
    {state.kind === 'loading' ? <p className="kairos-goals__note">Loading your goals…</p> : null}
    {state.kind === 'error' ? <p role="alert">Kairos could not load your goals.</p> : null}
    {state.kind === 'ready' && state.result.kind === 'time-zone-unconfigured' ? <p className="kairos-goals__unconfigured" role="status">Goals follow your daily-results calendar. <Link to="/settings">Set your time zone in Settings</Link> first.</p> : null}
    {state.kind === 'ready' && state.result.kind === 'time-zone-unconfigured' ? <DeviceTimeZoneButton metadata={repositories.metadata} onSaved={() => { void load(() => false); }} /> : null}
    {state.kind === 'ready' && state.result.kind === 'ready' ? <GoalsProgress progress={state.result.progress} inHomeCurrency={state.result.inHomeCurrency} /> : null}
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
