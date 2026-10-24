import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { describeTotalsInHomeCurrency } from '../../application/currency/currencyWords';
import type { ResultsInHomeCurrencySummary } from '../../application/currency/resultsInHomeCurrency';
import { describeLoss, describeReviewEveryTrade, describeTickEveryStep, hasNoGoals, loadGoalsProgress, type GoalsProgressProjection, type GoalsProgressQueryResult } from '../../application/goals';
import type { KairosDatabase } from '../../data/database';
import { Card, ErrorState, ProgressBar, ProgressRing } from '../../design-system/primitives';
import './goals.css';

/** SPA navigation inside the app, a plain link outside a router (features never import app). */
function GoalsLink({ to, children }: { readonly to: string; readonly children: ReactNode }) {
  return useInRouterContext() ? <Link to={to}>{children}</Link> : <a href={to}>{children}</a>;
}

/** The words of the goals that are not set, in the order they show. */
function unsetNames(progress: Extract<GoalsProgressProjection, { kind: 'ready' }>): string[] {
  const names: [boolean, string][] = [
    [progress.tradesPerMonth.kind === 'unset', 'Closed trades this month'], [progress.monthlyResult.kind === 'unset', 'Result this month'],
    [progress.reviewEveryTrade.kind === 'unset', 'Review every trade'], [progress.tickEveryStep.kind === 'unset', 'Tick every step'],
    [progress.maxTradesPerDay.kind === 'unset', 'Most trades in a day'], [progress.dailyLoss.kind === 'unset', 'Most I can lose in a day'],
    [progress.weeklyLoss.kind === 'unset', 'Most I can lose in a week'],
  ];
  return names.filter(([unset]) => unset).map(([, name]) => name);
}

type GoalRow = Readonly<{ id: string; state: string; title: string; sentence: ReactNode; draw: ReactNode }>;

/**
 * The goals that are set, in the Goals page's words (D249): targets this month as rings, limits today and this week as
 * bars. Every number and fill comes from the goals owner; a ring or bar only draws it, and the sentence says it.
 */
export function GoalsProgress({ progress, inHomeCurrency, level = 2, place = 'goals' }: {
  readonly progress: GoalsProgressProjection; readonly inHomeCurrency: ResultsInHomeCurrencySummary | null; readonly level?: 2 | 3;
  /** Where the "Not set yet" line points: the form below, or the Goals page. */
  readonly place?: 'goals' | 'analysis';
}) {
  if (progress.kind !== 'ready') return <p role="alert" data-goals-progress="unavailable">{progress.reason === 'invalid-time-zone' ? 'Your daily-results time zone is not valid. Fix it in Settings.' : 'The current time could not be read.'}</p>;
  const { tradesPerMonth, maxTradesPerDay, monthlyResult, dailyLoss, weeklyLoss, reviewEveryTrade, tickEveryStep } = progress;
  const homeWords = describeTotalsInHomeCurrency(inHomeCurrency);
  const Heading = level === 2 ? 'h2' : 'h3';
  const leftOut = (days: number) => (days > 0 ? ` (${days} ${days === 1 ? 'day' : 'days'} in another currency or without a result)` : '');
  const rows: GoalRow[] = [];
  if (tradesPerMonth.kind === 'progress') rows.push({
    id: 'trades-per-month', state: tradesPerMonth.reached ? 'reached' : 'progress', title: 'Closed trades this month',
    sentence: <><strong>{tradesPerMonth.current}</strong> of {tradesPerMonth.target} · {tradesPerMonth.reached ? 'target reached' : `${tradesPerMonth.target - tradesPerMonth.current} to go`}</>,
    draw: <ProgressRing fill={tradesPerMonth.fill} tone={tradesPerMonth.reached ? 'reached' : 'progress'}>{tradesPerMonth.reached ? '✓' : null}</ProgressRing>,
  });
  if (monthlyResult.kind !== 'unset') rows.push({
    id: 'monthly-result', state: monthlyResult.kind === 'unavailable' ? 'unavailable' : monthlyResult.reached ? 'reached' : 'progress', title: 'Result this month',
    sentence: monthlyResult.kind === 'unavailable'
      ? <>Target {monthlyResult.target} {monthlyResult.currency} · {monthlyResult.reason === 'no-comparable-days' ? `no closed trade this month has a result in ${monthlyResult.currency} yet` : 'the month total could not be added'}{leftOut(monthlyResult.incompleteDays)}.</>
      : <><strong>{monthlyResult.current}</strong> of {monthlyResult.target} {monthlyResult.currency} · {monthlyResult.reached ? 'target reached' : `${monthlyResult.remaining} to go`}{leftOut(monthlyResult.incompleteDays)}</>,
    draw: monthlyResult.kind === 'unavailable' ? <ProgressRing fill={0} tone="unknown">?</ProgressRing>
      : <ProgressRing fill={monthlyResult.fill} tone={monthlyResult.reached ? 'reached' : 'progress'}>{monthlyResult.reached ? '✓' : null}</ProgressRing>,
  });
  const review = describeReviewEveryTrade(reviewEveryTrade);
  if (review !== null) rows.push({
    id: 'review-every-trade', state: reviewEveryTrade.kind !== 'progress' ? reviewEveryTrade.kind : reviewEveryTrade.reached ? 'reached' : 'progress', title: 'Review every trade', sentence: review,
    draw: reviewEveryTrade.kind === 'progress' ? <ProgressRing fill={reviewEveryTrade.fill} tone={reviewEveryTrade.reached ? 'reached' : 'progress'}>{reviewEveryTrade.reached ? '✓' : null}</ProgressRing> : <ProgressRing fill={0} tone="unknown">?</ProgressRing>,
  });
  const tick = describeTickEveryStep(tickEveryStep);
  if (tick !== null) rows.push({
    id: 'tick-every-step', state: tickEveryStep.kind !== 'progress' ? tickEveryStep.kind : tickEveryStep.reached ? 'reached' : 'progress', title: 'Tick every step', sentence: tick,
    draw: tickEveryStep.kind === 'progress' ? <ProgressRing fill={tickEveryStep.fill} tone={tickEveryStep.reached ? 'reached' : 'progress'}>{tickEveryStep.reached ? '✓' : null}</ProgressRing> : <ProgressRing fill={0} tone="unknown">?</ProgressRing>,
  });
  if (maxTradesPerDay.kind === 'limit') rows.push({
    id: 'max-trades-per-day', state: maxTradesPerDay.exceeded ? 'exceeded' : maxTradesPerDay.remaining === 0 ? 'at-limit' : 'within', title: 'Trades opened today',
    sentence: <><strong>{maxTradesPerDay.today}</strong> of {maxTradesPerDay.limit} allowed · {maxTradesPerDay.exceeded ? 'over your limit' : maxTradesPerDay.remaining === 0 ? 'at your limit' : `${maxTradesPerDay.remaining} left`}</>,
    draw: <ProgressBar fill={maxTradesPerDay.fill} tone={maxTradesPerDay.exceeded ? 'over' : 'inside'} />,
  });
  for (const [loss, id, title, period] of [[dailyLoss, 'daily-loss', 'Lost today', 'today'], [weeklyLoss, 'weekly-loss', 'Lost this week', 'this week']] as const) {
    const sentence = describeLoss(loss, period);
    if (sentence === null || loss.kind === 'unset') continue;
    rows.push({
      id, title, sentence, state: loss.kind === 'unknown' ? 'unknown' : loss.state,
      draw: loss.kind === 'unknown' ? <ProgressBar fill={0} tone="unknown" /> : <ProgressBar fill={loss.fill} tone={loss.state === 'over' ? 'over' : 'inside'} />,
    });
  }
  const unset = unsetNames(progress);
  return <div className="kairos-goals__progress" data-goals-progress="ready" data-goals-month={progress.monthKey} data-goals-today={progress.todayKey}>
    {rows.map(row => <Card as="article" key={row.id} className="kairos-goals-card" data-goal={row.id} data-goal-state={row.state}>
      <Heading>{row.title}</Heading>
      <div className="kairos-goals-card__row">
        {row.draw}
        <p>{row.state === 'over' || row.state === 'exceeded' ? <span className="kairos-goals-card__mark" aria-hidden="true">! </span> : null}{row.sentence}</p>
      </div>
    </Card>)}
    {unset.length > 0 ? <p className="kairos-goals__note" data-goals-unset="">
      {rows.length === 0 ? 'No goals set yet.' : `Not set yet: ${unset.join(', ')}.`}{' '}
      {place === 'goals' ? 'Set them below.' : <GoalsLink to="/goals">Set them on the Goals page.</GoalsLink>}
    </p> : null}
    <p className="kairos-goals__note">Counted from your trades this month ({progress.monthKey}) and this week (from {progress.weekFromDayKey}), time zone {progress.timeZone}. Results are your recorded results after fees, never estimates.</p>
    {homeWords ? <p className="kairos-goals__note">{homeWords.text} <GoalsLink to="/currency">{homeWords.link}</GoalsLink></p> : null}
  </div>;
}

type CardState = Readonly<{ kind: 'loading' }> | Readonly<{ kind: 'error' }> | Readonly<{ kind: 'ready'; result: GoalsProgressQueryResult }>;

/** Analysis › Discipline "Your goals" (D220): the month's progress, read from the goals owner, and the way to change them. */
export function GoalsProgressCard({ db, now }: { readonly db: KairosDatabase; readonly now: () => string }) {
  const titleId = useId();
  const [state, setState] = useState<CardState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let ignore = false;
    // A retry keeps the error box (and its busy "Try again") until the answer comes.
    setState(current => (current.kind === 'error' ? current : { kind: 'loading' }));
    loadGoalsProgress(db, now()).then(
      result => { if (!ignore) setState({ kind: 'ready', result }); },
      () => { if (!ignore) setState({ kind: 'error' }); },
    );
    return () => { ignore = true; };
  }, [db, now, attempt]);
  // After "Try again" works, focus goes to the card's heading; while it fails, the error box keeps it.
  useEffect(() => {
    if (state.kind === 'loading' || !retrying) return;
    if (state.kind === 'ready') titleRef.current?.focus();
    setRetrying(false);
  }, [state]);
  const result = state.kind === 'ready' ? state.result : null;
  const progress = result?.kind === 'ready' ? result.progress : null;
  const none = result?.kind === 'ready' && hasNoGoals(result.preference);
  return <section className="kairos-discipline-part__block" aria-labelledby={titleId}>
    <h2 id={titleId} ref={titleRef} tabIndex={-1}>Your goals</h2>
    {state.kind === 'loading' ? <p>Loading your goals…</p> : null}
    {state.kind === 'error' ? <ErrorState message="Kairos could not load your goals." onRetry={() => { setRetrying(true); setAttempt(value => value + 1); }} busy={retrying} /> : null}
    {result?.kind === 'time-zone-unconfigured' ? <p>Goals follow your daily-results calendar, so they need your time zone first. <GoalsLink to="/settings">Open Settings</GoalsLink></p> : null}
    {none ? <Card as="div" className="kairos-goals-card"><p>No goals yet.</p><p><GoalsLink to="/goals">Set a goal</GoalsLink></p></Card> : null}
    {progress !== null && !none && result?.kind === 'ready' ? <>
      <GoalsProgress progress={progress} inHomeCurrency={result.inHomeCurrency} level={3} place="analysis" />
      <p><GoalsLink to="/goals">Change your goals</GoalsLink></p>
    </> : null}
  </section>;
}
