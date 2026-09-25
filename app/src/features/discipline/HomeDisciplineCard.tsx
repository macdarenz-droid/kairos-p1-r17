import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { describeTotalsInHomeCurrency } from '../../application/currency/currencyWords';
import { loadDisciplineScore, type DisciplineScoreQueryResult } from '../../application/discipline';
import { loadGoalsProgress, type GoalsProgressQueryResult } from '../../application/goals';
import type { KairosDatabase } from '../../data/database';
import { Card } from '../../design-system/primitives';
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
  const { tradesPerMonth, maxTradesPerDay, monthlyResult } = result.progress;
  const lines: string[] = [];
  if (tradesPerMonth.kind === 'progress') lines.push(`Closed trades: ${tradesPerMonth.current} of ${tradesPerMonth.target}${tradesPerMonth.reached ? ' · target reached' : ''}`);
  if (maxTradesPerDay.kind === 'limit') lines.push(`Trades opened today: ${maxTradesPerDay.today} of ${maxTradesPerDay.limit} allowed${maxTradesPerDay.exceeded ? ' · over your limit' : ''}`);
  if (monthlyResult.kind === 'progress') lines.push(`Result this month: ${monthlyResult.current} of ${monthlyResult.target} ${monthlyResult.currency}${monthlyResult.reached ? ' · target reached' : ''}`);
  if (monthlyResult.kind === 'unavailable') lines.push('Result this month: not available yet');
  if (lines.length === 0) return <p>No goals set yet.</p>;
  const homeWords = describeTotalsInHomeCurrency(result.inHomeCurrency);
  return <>{lines.map(line => <p key={line}>{line}</p>)}{homeWords ? <p>{homeWords.text} <CardLink to="/currency">{homeWords.link}</CardLink></p> : null}</>;
}

/** Home "Your Trades": this month's discipline ring and the goals the user set, each from its own owner. */
export function HomeDisciplineCard({ db, now }: { readonly db: KairosDatabase; readonly now: () => string }) {
  const titleId = useId();
  const [state, setState] = useState<CardState>({ kind: 'loading' });

  useEffect(() => {
    let ignore = false;
    const instant = now();
    setState({ kind: 'loading' });
    Promise.all([loadDisciplineScore(db, { now: instant }), loadGoalsProgress(db, instant)]).then(
      ([discipline, goals]) => { if (!ignore) setState({ kind: 'ready', discipline, goals }); },
      () => { if (!ignore) setState({ kind: 'error' }); },
    );
    return () => { ignore = true; };
  }, [db, now]);

  const unconfigured = state.kind === 'ready' && (state.discipline.kind === 'time-zone-unconfigured' || state.goals.kind === 'time-zone-unconfigured');
  return <Card as="section" className="kairos-home-discipline" aria-labelledby={titleId}>
    <div className="kairos-home-discipline__heading">
      <h3 id={titleId}>Your discipline and goals</h3>
      <p>This month</p>
    </div>
    {state.kind === 'loading' ? <p>Loading your discipline and goals…</p> : null}
    {state.kind === 'error' ? <p>Kairos could not load your discipline and goals.</p> : null}
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
