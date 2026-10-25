import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { describeTotalsInHomeCurrency } from '../../application/currency/currencyWords';
import { loadDisciplineScore, type DisciplineScoreQueryResult } from '../../application/discipline';
import { describeLossShort, describeReviewShort, describeTickShort, loadGoalsProgress, type GoalsProgressQueryResult } from '../../application/goals';
import type { KairosDatabase } from '../../data/database';
import { Card, ErrorState, ProgressBar, ProgressRing } from '../../design-system/primitives';
import { DisciplineScoreRing } from './DisciplineScorePanel';
import './disciplineScore.css';

type CardState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'error' }>
  | Readonly<{ kind: 'ready'; discipline: DisciplineScoreQueryResult; goals: GoalsProgressQueryResult }>;

/** SPA navigation inside the app, a plain link outside a router (as ReviewTradeLink does; features never import app). */
function CardLink({ to, children }: { readonly to: string; readonly children: ReactNode }) {
  return useInRouterContext() ? <Link to={to}>{children}</Link> : <a href={to}>{children}</a>;
}

function DisciplineLine({ result }: { readonly result: DisciplineScoreQueryResult }) {
  if (result.kind !== 'ready') return <><DisciplineScoreRing score={null} size="small" /><p>Your discipline score is not available right now.</p></>;
  const { score } = result;
  if (!score.available) return <><DisciplineScoreRing score={null} size="small" /><p>Your score appears after your first closed trade this month.</p></>;
  return <>
    <DisciplineScoreRing score={score.score} size="small" />
    <p>{score.checklist === null ? `Reviews ${score.review.percent}%` : `Checklist ${score.checklist.percent}% · Reviews ${score.review.percent}%`}</p>
  </>;
}

/** The goals the user set, in the Goals page's words; every number comes from the goals owner, nothing is worked out here. */
function GoalsLines({ result }: { readonly result: GoalsProgressQueryResult }) {
  if (result.kind !== 'ready' || result.progress.kind !== 'ready') return <p>Goals are not available right now.</p>;
  const { tradesPerMonth, maxTradesPerDay, monthlyResult, dailyLoss, weeklyLoss, reviewEveryTrade, tickEveryStep } = result.progress;
  // U13 (D249): a small ring (a target) or bar (a limit) beside each line; the line says it all.
  const lines: { readonly text: string; readonly draw: ReactNode }[] = [];
  if (tradesPerMonth.kind === 'progress') lines.push({ text: `Closed trades: ${tradesPerMonth.current} of ${tradesPerMonth.target}${tradesPerMonth.reached ? ' · target reached' : ''}`, draw: <ProgressRing fill={tradesPerMonth.fill} tone={tradesPerMonth.reached ? 'reached' : 'progress'} /> });
  if (maxTradesPerDay.kind === 'limit') lines.push({ text: `Trades opened today: ${maxTradesPerDay.today} of ${maxTradesPerDay.limit} allowed${maxTradesPerDay.exceeded ? ' · over your limit' : ''}`, draw: <ProgressBar fill={maxTradesPerDay.fill} tone={maxTradesPerDay.exceeded ? 'over' : 'inside'} /> });
  // Only the loss limits are money here (the result goal is on the Goals page, D267), so only they carry the home-currency note.
  let moneyLine = false;
  for (const [loss, period] of [[dailyLoss, 'today'], [weeklyLoss, 'this week']] as const) {
    const text = describeLossShort(loss, period);
    if (text === null || loss.kind === 'unset') continue;
    moneyLine = true;
    lines.push({ text, draw: loss.kind === 'unknown' ? <ProgressBar fill={0} tone="unknown" /> : <ProgressBar fill={loss.fill} tone={loss.state === 'over' ? 'over' : 'inside'} /> });
  }
  const reviewed = describeReviewShort(reviewEveryTrade);
  if (reviewed !== null && reviewEveryTrade.kind === 'progress') lines.push({ text: reviewed, draw: <ProgressRing fill={reviewEveryTrade.fill} tone={reviewEveryTrade.reached ? 'reached' : 'progress'} /> });
  const ticked = describeTickShort(tickEveryStep);
  if (ticked !== null && tickEveryStep.kind === 'progress') lines.push({ text: ticked, draw: <ProgressRing fill={tickEveryStep.fill} tone={tickEveryStep.reached ? 'reached' : 'progress'} /> });
  // D267: Home's month result is on "Today"; the result goal (D116's own rule) stays on the Goals page.
  if (lines.length === 0) return <p>{monthlyResult.kind === 'unset' ? 'No goals set yet.' : 'Your result goal is on the Goals page.'}</p>;
  // The note speaks of the home currency: only beside a loss limit set in it.
  const homeWords = moneyLine && result.preference.lossLimits?.currency === result.inHomeCurrency?.homeCurrency ? describeTotalsInHomeCurrency(result.inHomeCurrency) : null;
  return <>{lines.map(line => <div className="kairos-home-discipline__goal" key={line.text}>{line.draw}<p>{line.text}</p></div>)}{homeWords ? <p>{homeWords.text} <CardLink to="/currency">{homeWords.link}</CardLink></p> : null}</>;
}

/** Home "Your Trades": this month's discipline ring and the goals the user set, each from its own owner. */
export function HomeDisciplineCard({ db, now }: { readonly db: KairosDatabase; readonly now: () => string }) {
  const titleId = useId();
  const [state, setState] = useState<CardState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let ignore = false;
    const instant = now();
    // A retry keeps the error box (and its busy "Try again") until the answer comes.
    setState(current => (current.kind === 'error' ? current : { kind: 'loading' }));
    Promise.all([loadDisciplineScore(db, { now: instant }), loadGoalsProgress(db, instant)]).then(
      ([discipline, goals]) => { if (!ignore) setState({ kind: 'ready', discipline, goals }); },
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

  const unconfigured = state.kind === 'ready' && (state.discipline.kind === 'time-zone-unconfigured' || state.goals.kind === 'time-zone-unconfigured');
  return <Card as="section" className="kairos-home-discipline" aria-labelledby={titleId}>
    <div className="kairos-home-discipline__heading">
      <h3 id={titleId} ref={titleRef} tabIndex={-1}>Your discipline and goals</h3>
      <p>This month</p>
    </div>
    {state.kind === 'loading' ? <p>Loading your discipline and goals…</p> : null}
    {state.kind === 'error' ? <ErrorState message="Kairos could not load your discipline and goals." onRetry={() => { setRetrying(true); setAttempt(value => value + 1); }} busy={retrying} /> : null}
    {unconfigured ? <p>Choose your time zone in Settings to see your discipline and goals. <CardLink to="/settings">Open Settings</CardLink></p> : null}
    {state.kind === 'ready' && !unconfigured ? <>
      <div className="kairos-home-discipline__body">
        <div className="kairos-home-discipline__score"><DisciplineLine result={state.discipline} /></div>
        <div className="kairos-home-discipline__goals"><GoalsLines result={state.goals} /></div>
      </div>
      <p className="kairos-home-discipline__links"><CardLink to="/goals">See your goals</CardLink> · <CardLink to="/journal">See your checklist and reviews</CardLink></p>
    </> : null}
  </Card>;
}
