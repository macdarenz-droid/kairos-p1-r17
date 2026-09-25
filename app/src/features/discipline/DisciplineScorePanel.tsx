import { useId } from 'react';
import type { DisciplineScoreProjection } from '../../application/discipline';
import './disciplineScore.css';

/** The score as a ring: filled share of the circle, the number in the middle; a dashed empty ring when there is no score yet. */
export function DisciplineScoreRing({ score, size }: { readonly score: number | null; readonly size: 'large' | 'small' }) {
  return <svg role="img" viewBox="0 0 120 120" className={`kairos-discipline-ring kairos-discipline-ring--${size}`}
    aria-label={score === null ? 'Discipline score: not available yet' : `Discipline score: ${score} out of 100`}>
    <circle className="kairos-discipline-ring__track" cx="60" cy="60" r="50" pathLength={100} fill="none" strokeWidth={12}
      strokeDasharray={score === null ? '4 4' : undefined} />
    {score === null ? null : <circle className="kairos-discipline-ring__value" cx="60" cy="60" r="50" pathLength={100} fill="none" strokeWidth={12}
      strokeDasharray={`${score} 100`} strokeLinecap="butt" transform="rotate(-90 60 60)" />}
    <text className="kairos-discipline-ring__text" x="60" y="60" aria-hidden="true" textAnchor="middle" dominantBaseline="central">{score === null ? '—' : score}</text>
  </svg>;
}

export type DisciplineScorePanelState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly score: DisciplineScoreProjection };

const count = (value: number, of: number, noun: string) => `${value} of ${of} ${of === 1 ? noun : `${noun}s`}`;

function Bar({ percent }: { readonly percent: number }) {
  return <span className="kairos-discipline-bar" aria-hidden="true"><span style={{ inlineSize: `${percent}%` }} /></span>;
}

/** "Your discipline" beside the month calendar: the ring, two bars in plain sentences and the most common mistakes. It reads nothing. */
export function DisciplineScorePanel({ state, periodLabel, title = 'Your discipline' }: { readonly state: DisciplineScorePanelState; readonly periodLabel: string; readonly title?: string }) {
  const titleId = useId();
  return <section className="kairos-discipline-score" aria-labelledby={titleId}>
    <div className="kairos-discipline-score__heading">
      <h3 id={titleId}>{title}</h3>
      <p>Trades closed in {periodLabel}</p>
    </div>
    {state.kind === 'loading' ? <p>Loading your discipline score…</p> : null}
    {state.kind === 'error' ? <p>Kairos could not work out your discipline score. Your stored trades were not changed.</p> : null}
    {state.kind === 'ready' && !state.score.available ? <div className="kairos-discipline-score__body">
      <DisciplineScoreRing score={null} size="large" />
      <div className="kairos-discipline-score__text"><p>Your score appears when a trade closes in {periodLabel}.</p></div>
    </div> : null}
    {state.kind === 'ready' && state.score.available ? <div className="kairos-discipline-score__body">
      <DisciplineScoreRing score={state.score.score} size="large" />
      <div className="kairos-discipline-score__text">
        {state.score.checklist !== null ? <>
          <Bar percent={state.score.checklist.percent} />
          <p>Before you trade: you ticked {count(state.score.checklist.tickedCount, state.score.checklist.askedCount, 'step')} ({state.score.checklist.percent}%).</p>
          <p>You did every step on {count(state.score.checklist.fullTradeCount, state.score.checklist.tradeCount, 'trade')}.</p>
        </> : <p>Before you trade: none of these trades had a checklist, so the score uses your reviews only.</p>}
        <Bar percent={state.score.review.percent} />
        <p>After the trade: you reviewed {count(state.score.review.reviewedCount, state.score.review.closedCount, 'closed trade')} ({state.score.review.percent}%).</p>
        {state.score.review.reviewedCount > 0 ? <p>{state.score.topMistakes.length > 0
          ? `Most common mistakes: ${state.score.topMistakes.map(mistake => `${mistake.label} (${mistake.count})`).join(' · ')}`
          : 'No mistakes tagged in your reviews.'}</p> : null}
        <p className="kairos-discipline-score__notice">Only your checklist and reviews count. Profit, the number of trades and streaks never change this score.</p>
      </div>
    </div> : null}
  </section>;
}
