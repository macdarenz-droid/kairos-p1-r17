import { useId, useState } from 'react';
import type { DisciplineTrend } from '../../application/discipline/disciplineScore';
import type { GoalMonthJudgment, GoalsMonth } from '../../application/goals';
import { Card, ProgressRing, Segmented } from '../../design-system/primitives';
import './goals.css';

const utc = (monthKey: string) => new Date(`${monthKey}-01T00:00:00.000Z`);
const monthName = (monthKey: string) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utc(monthKey));
const shortMonth = (monthKey: string) => new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(utc(monthKey));
const longMonth = (monthKey: string) => new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(utc(monthKey));
const times = (count: number) => (count === 1 ? 'once' : `${count} times`);
const leftOut = (days: number) => (days > 0 ? ` (${days} ${days === 1 ? 'day' : 'days'} in another currency or without a result)` : '');

const STATE_WORDS = { kept: 'kept', missed: 'missed', 'in-progress': 'in progress', unknown: "Kairos can't tell", 'no-trades': 'no trades' } as const;

/** One goal of a month, in plain words. Every number comes from the goals owner. */
function judgmentLine(item: GoalMonthJudgment): string {
  const state = STATE_WORDS[item.state];
  switch (item.goal) {
    case 'trades-per-month': return `Closed trades: ${state} · ${item.current} of ${item.target}`;
    case 'monthly-result': return `${item.current === null ? `Result this month: ${state}` : `Result this month: ${state} · ${item.current} of ${item.target} ${item.currency}`}${leftOut(item.incompleteDays)}`;
    case 'review-every-trade': return item.state === 'no-trades' ? 'Review every trade: no closed trades' : `Review every trade: ${state} · ${item.reviewed} of ${item.closed} reviewed`;
    case 'tick-every-step': return item.state === 'no-trades' ? 'Tick every step: no closed trades' : item.state === 'unknown' ? 'Tick every step: your checklist has no steps yet' : `Tick every step: ${state} · ${item.ticked} of ${item.closed}`;
    case 'max-trades-per-day': return item.state === 'missed' ? `Most trades in a day: missed on ${item.missedDays === 1 ? '1 day' : `${item.missedDays} days`}` : `Most trades in a day: ${state}`;
    case 'daily-loss': return item.state === 'missed' ? `Most I can lose in a day: missed on ${item.missedDays === 1 ? '1 day' : `${item.missedDays} days`}`
      : item.state === 'unknown' ? `Most I can lose in a day: Kairos can't tell: ${item.uncounted === 1 ? '1 trade has' : `${item.uncounted} trades have`} no result in ${item.currency}` : `Most I can lose in a day: ${state}`;
    case 'weekly-loss': return item.state === 'missed' ? `Most I can lose in a week: missed in ${item.missedWeeks === 1 ? '1 week' : `${item.missedWeeks} weeks`}`
      : item.state === 'unknown' ? `Most I can lose in a week: Kairos can't tell: ${item.uncounted === 1 ? '1 trade has' : `${item.uncounted} trades have`} no result in ${item.currency}` : `Most I can lose in a week: ${state}`;
  }
}

function tileName(month: GoalsMonth): string {
  if (month.goals === null) return `${monthName(month.monthKey)}: no goals then`;
  if (month.judged === 0) return `${monthName(month.monthKey)}: no trades to judge`;
  const parts = [month.missed > 0 ? `${month.missed} missed` : null, month.inProgress > 0 ? `${month.inProgress} in progress` : null, month.unknown > 0 ? `${month.unknown} Kairos can't tell` : null].filter(Boolean);
  return `${monthName(month.monthKey)}: ${month.kept} of ${month.judged} ${month.judged === 1 ? 'goal' : 'goals'} kept${parts.length > 0 ? `, ${parts.join(', ')}` : ''}`;
}

/** The score month by month as dots joined by a line, with gaps for months without a closed trade; it only draws. */
function ScoreLine({ scores }: { readonly scores: DisciplineTrend['scores'] }) {
  const step = scores.length > 1 ? 280 / (scores.length - 1) : 0;
  const point = (index: number, score: number) => `${10 + index * step},${90 - score * 0.8}`;
  const runs: string[][] = [];
  scores.forEach((month, index) => {
    if (month.score === null) { runs.push([]); return; }
    if (runs.length === 0) runs.push([]);
    runs[runs.length - 1]!.push(point(index, month.score));
  });
  return <svg className="kairos-goals-trend__line" viewBox="0 0 300 100" aria-hidden="true" focusable="false">
    <line x1="10" x2="290" y1="90" y2="90" className="kairos-goals-trend__axis" />
    {runs.filter(run => run.length > 1).map(run => <polyline key={run[0]} points={run.join(' ')} fill="none" />)}
    {scores.map((month, index) => (month.score === null ? null : <circle key={month.monthKey} cx={10 + index * step} cy={90 - month.score * 0.8} r="4" />))}
  </svg>;
}

/** U13 (D251): the Goals page's month by month: goals kept, the discipline score and the common mistakes. */
export function GoalsByMonth({ months, trend }: { readonly months: readonly GoalsMonth[]; readonly trend: Readonly<{ 6: DisciplineTrend; 12: DisciplineTrend }> }) {
  const titleId = useId();
  const [shown, setShown] = useState<'6' | '12'>('6');
  const [selected, setSelected] = useState<string | null>(null);
  const visible = months.slice(-Number(shown));
  const series = trend[shown === '6' ? 6 : 12];
  const open = visible.find(month => month.monthKey === selected) ?? null;

  return <Card as="section" className="kairos-goals-card kairos-goals-months" aria-labelledby={titleId}>
    <h2 id={titleId}>Month by month</h2>
    <Segmented label="Months shown" value={shown} onChange={value => { setShown(value); setSelected(null); }} options={[{ value: '6', label: '6 months' }, { value: '12', label: '12 months' }]} />
    <ol className="kairos-goals-months__tiles" aria-label="Months">{visible.map(month => <li key={month.monthKey}>
      <button type="button" className="kairos-goals-months__tile" aria-label={tileName(month)} aria-pressed={selected === month.monthKey} onClick={() => setSelected(current => (current === month.monthKey ? null : month.monthKey))}>
        <span aria-hidden="true">{shortMonth(month.monthKey)}</span>
        <ProgressRing fill={month.judged === 0 ? 0 : (100 * month.kept) / month.judged} tone={month.judged === 0 ? 'unknown' : month.missed > 0 ? 'over' : month.kept === month.judged ? 'reached' : 'progress'} />
        <span aria-hidden="true">{month.goals === null ? '–' : `${month.kept} of ${month.judged}`}</span>
      </button>
    </li>)}</ol>
    <div className="kairos-goals-months__details" aria-live="polite">{open !== null ? <>
      <h3>{monthName(open.monthKey)}{open.thisMonth ? ' (so far)' : ''}</h3>
      {open.goals === null ? <p>No goals then.</p> : open.goals.map(item => <p key={item.goal}>{judgmentLine(item)}</p>)}
    </> : null}</div>
    <p className="kairos-goals__note">Each month is judged by the goals you had then. Review an old trade and its month updates.</p>

    <h3>Your discipline score by month</h3>
    {series.scores.every(month => month.score === null) ? <p>Your score appears for months with a closed trade.</p> : <>
      <ScoreLine scores={series.scores} />
      <p className="kairos-visually-hidden">{series.scores.map(month => `${longMonth(month.monthKey)} ${month.score === null ? 'no closed trades' : month.score}`).join(' · ')}</p>
    </>}

    <h3>Your most common mistakes</h3>
    {series.mistakes.length === 0 ? <p>No mistakes tagged in your reviews in these months.</p> : <ul className="kairos-goals-months__mistakes">{series.mistakes.map(mistake => {
      const most = Math.max(1, ...mistake.counts.map(month => month.count ?? 0));
      return <li key={mistake.itemId}>
        <p><strong>{mistake.label}</strong> · {times(mistake.total)} in {shown} months</p>
        <span className="kairos-goals-months__bars" aria-hidden="true">{mistake.counts.map(month => month.count === null
          ? <span key={month.monthKey} className="kairos-goals-months__none">–</span>
          : <span key={month.monthKey} className="kairos-goals-months__bar" style={{ height: `${Math.round((100 * month.count) / most)}%` }} />)}</span>
        <p className="kairos-visually-hidden">{mistake.counts.map(month => `${longMonth(month.monthKey)} ${month.count === null ? 'no reviews' : month.count}`).join(' · ')}</p>
      </li>;
    })}</ul>}
  </Card>;
}
