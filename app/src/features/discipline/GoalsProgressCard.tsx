import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { describeTotalsInHomeCurrency } from '../../application/currency/currencyWords';
import type { ResultsInHomeCurrencySummary } from '../../application/currency/resultsInHomeCurrency';
import { loadGoalsProgress, type GoalsProgressProjection, type GoalsProgressQueryResult } from '../../application/goals';
import type { KairosDatabase } from '../../data/database';
import { Card } from '../../design-system/primitives';
import './goals.css';

/** SPA navigation inside the app, a plain link outside a router (features never import app). */
function GoalsLink({ to, children }: { readonly to: string; readonly children: ReactNode }) {
  return useInRouterContext() ? <Link to={to}>{children}</Link> : <a href={to}>{children}</a>;
}

/** The month's goals, one card each, in the Goals page's words; every number comes from the goals owner. */
export function GoalsProgress({ progress, inHomeCurrency, level = 2 }: { readonly progress: GoalsProgressProjection; readonly inHomeCurrency: ResultsInHomeCurrencySummary | null; readonly level?: 2 | 3 }) {
  if (progress.kind !== 'ready') return <p role="alert" data-goals-progress="unavailable">{progress.reason === 'invalid-time-zone' ? 'Your daily-results time zone is not valid. Fix it in Settings.' : 'The current time could not be read.'}</p>;
  const { tradesPerMonth, maxTradesPerDay, monthlyResult } = progress;
  const homeWords = describeTotalsInHomeCurrency(inHomeCurrency);
  const Heading = level === 2 ? 'h2' : 'h3';
  return <div className="kairos-goals__progress" data-goals-progress="ready" data-goals-month={progress.monthKey} data-goals-today={progress.todayKey}>
    <Card as="article" className="kairos-goals-card" data-goal="trades-per-month" data-goal-state={tradesPerMonth.kind === 'unset' ? 'unset' : tradesPerMonth.reached ? 'reached' : 'progress'}>
      <Heading>Closed trades this month</Heading>
      {tradesPerMonth.kind === 'unset' ? <p>No target set.</p> : <p><strong>{tradesPerMonth.current}</strong> of {tradesPerMonth.target} · {tradesPerMonth.reached ? 'target reached' : `${tradesPerMonth.target - tradesPerMonth.current} to go`}</p>}
    </Card>
    <Card as="article" className="kairos-goals-card" data-goal="max-trades-per-day" data-goal-state={maxTradesPerDay.kind === 'unset' ? 'unset' : maxTradesPerDay.exceeded ? 'exceeded' : maxTradesPerDay.remaining === 0 ? 'at-limit' : 'within'}>
      <Heading>Trades opened today</Heading>
      {maxTradesPerDay.kind === 'unset' ? <p>No limit set.</p> : <p><strong>{maxTradesPerDay.today}</strong> of {maxTradesPerDay.limit} allowed · {maxTradesPerDay.exceeded ? 'over your limit' : maxTradesPerDay.remaining === 0 ? 'at your limit' : `${maxTradesPerDay.remaining} left`}</p>}
    </Card>
    <Card as="article" className="kairos-goals-card" data-goal="monthly-result" data-goal-state={monthlyResult.kind === 'unset' ? 'unset' : monthlyResult.kind === 'unavailable' ? 'unavailable' : monthlyResult.reached ? 'reached' : 'progress'}>
      <Heading>Result this month</Heading>
      {monthlyResult.kind === 'unset' ? <p>No result target set.</p>
        : monthlyResult.kind === 'unavailable' ? <p>Target {monthlyResult.target} {monthlyResult.currency} · {monthlyResult.reason === 'no-comparable-days' ? `no closed trade this month has a result in ${monthlyResult.currency} yet` : 'the month total could not be added'}{monthlyResult.incompleteDays > 0 ? ` (${monthlyResult.incompleteDays} ${monthlyResult.incompleteDays === 1 ? 'day' : 'days'} in another currency or without a result)` : ''}.</p>
        : <p><strong>{monthlyResult.current}</strong> of {monthlyResult.target} {monthlyResult.currency} · {monthlyResult.reached ? 'target reached' : `${monthlyResult.remaining} to go`}{monthlyResult.incompleteDays > 0 ? ` (${monthlyResult.incompleteDays} ${monthlyResult.incompleteDays === 1 ? 'day' : 'days'} in another currency or without a result)` : ''}</p>}
    </Card>
    <p className="kairos-goals__note">Counted from all your trades this month ({progress.monthKey}, time zone {progress.timeZone}). Results are your recorded results after fees, never estimates.</p>
    {homeWords ? <p className="kairos-goals__note">{homeWords.text} <GoalsLink to="/currency">{homeWords.link}</GoalsLink></p> : null}
  </div>;
}

type CardState = Readonly<{ kind: 'loading' }> | Readonly<{ kind: 'error' }> | Readonly<{ kind: 'ready'; result: GoalsProgressQueryResult }>;

/** Analysis › Discipline "Your goals" (D220): the month's progress, read from the goals owner, and the way to change them. */
export function GoalsProgressCard({ db, now }: { readonly db: KairosDatabase; readonly now: () => string }) {
  const titleId = useId();
  const [state, setState] = useState<CardState>({ kind: 'loading' });
  useEffect(() => {
    let ignore = false;
    setState({ kind: 'loading' });
    loadGoalsProgress(db, now()).then(
      result => { if (!ignore) setState({ kind: 'ready', result }); },
      () => { if (!ignore) setState({ kind: 'error' }); },
    );
    return () => { ignore = true; };
  }, [db, now]);
  const result = state.kind === 'ready' ? state.result : null;
  const progress = result?.kind === 'ready' ? result.progress : null;
  const none = progress?.kind === 'ready' && progress.tradesPerMonth.kind === 'unset' && progress.maxTradesPerDay.kind === 'unset' && progress.monthlyResult.kind === 'unset';
  return <section className="kairos-discipline-part__block" aria-labelledby={titleId}>
    <h2 id={titleId}>Your goals</h2>
    {state.kind === 'loading' ? <p>Loading your goals…</p> : null}
    {state.kind === 'error' ? <p role="alert">Kairos could not load your goals.</p> : null}
    {result?.kind === 'time-zone-unconfigured' ? <p>Goals follow your daily-results calendar, so they need your time zone first. <GoalsLink to="/settings">Open Settings</GoalsLink></p> : null}
    {none ? <Card as="div" className="kairos-goals-card"><p>No goals yet.</p><p><GoalsLink to="/goals">Set a goal</GoalsLink></p></Card> : null}
    {progress !== null && !none && result?.kind === 'ready' ? <>
      <GoalsProgress progress={progress} inHomeCurrency={result.inHomeCurrency} level={3} />
      <p><GoalsLink to="/goals">Change your goals</GoalsLink></p>
    </> : null}
  </section>;
}
