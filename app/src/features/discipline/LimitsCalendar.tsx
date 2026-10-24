import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { describeTotalsInHomeCurrency } from '../../application/currency/currencyWords';
import { loadGoalsHistory, type GoalsHistoryResult, type LimitsCalendarDay, type LimitsCalendarMonth, type LimitsDayLoss } from '../../application/goals';
import { writeVisualPnlPeriodChoice } from '../../application/visual-pnl';
import type { KairosDatabase } from '../../data/database';
import { Button, Card, ErrorState } from '../../design-system/primitives';
import { GoalsByMonth } from './GoalsByMonth';
import './goals.css';

function CalendarLink({ to, children }: { readonly to: string; readonly children: ReactNode }) {
  return useInRouterContext() ? <Link to={to}>{children}</Link> : <a href={to}>{children}</a>;
}

const WEEKDAYS = [['Mon', 'Monday'], ['Tue', 'Tuesday'], ['Wed', 'Wednesday'], ['Thu', 'Thursday'], ['Fri', 'Friday'], ['Sat', 'Saturday'], ['Sun', 'Sunday']] as const;
const MARKS = { inside: '✓', over: '!', unknown: '?' } as const;
const STATE_WORDS = { inside: 'inside your limits', over: 'over a limit', unknown: "Kairos can't tell", 'no-trades': 'no trades', 'no-limits': 'no limits set then', later: '' } as const;

const utc = (dayKey: string) => new Date(`${dayKey}T00:00:00.000Z`);
const dayName = (dayKey: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(utc(dayKey));
const longDayName = (dayKey: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(utc(dayKey));
const monthName = (monthKey: string) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utc(`${monthKey}-01`));
const days = (count: number) => (count === 1 ? '1 day' : `${count} days`);

function lossLine(label: string, loss: LimitsDayLoss): string {
  if (loss.kind === 'unknown') return `${label}: Kairos can't tell. ${loss.uncounted === 1 ? '1 trade has' : `${loss.uncounted} trades have`} no result in ${loss.currency}.`;
  if (loss.lost === '0') return `${label}: nothing`;
  const tail = loss.state === 'over' ? ' · over your limit' : loss.state === 'at-limit' ? ' · at your limit' : '';
  return `${label}: ${loss.lost} of ${loss.limit} ${loss.currency}${tail}`;
}

function DayDetails({ day }: { readonly day: LimitsCalendarDay }) {
  const lines: string[] = [];
  if (day.trades !== null) {
    const { opened, limit, state } = day.trades;
    lines.push(`Trades: ${opened} of ${limit} allowed · ${state === 'over' ? 'over your limit' : state === 'at-limit' ? 'at your limit' : `${limit - opened} left`}`);
  }
  if (day.dayLoss !== null) lines.push(lossLine('Lost that day', day.dayLoss));
  if (day.weekLoss !== null) lines.push(lossLine('Lost that week so far', day.weekLoss));
  const link = `/analysis?${writeVisualPnlPeriodChoice({ kind: 'custom', firstDayKey: day.dayKey, lastDayKey: day.dayKey }, new URLSearchParams()).toString()}`;
  return <>
    <h3>{longDayName(day.dayKey)}</h3>
    {lines.map(line => <p key={line}>{line}</p>)}
    <p><CalendarLink to={link}>See this day's trades</CalendarLink></p>
  </>;
}

function MonthGrid({ month, selected, onSelect }: { readonly month: LimitsCalendarMonth; readonly selected: string | null; readonly onSelect: (dayKey: string) => void }) {
  const cells: (LimitsCalendarDay | null)[] = [...Array<null>(month.leadingEmptyCells).fill(null), ...month.days];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  return <table className="kairos-limits__grid">
    <caption className="kairos-visually-hidden">{monthName(month.monthKey)}</caption>
    <thead><tr>{WEEKDAYS.map(([short, long]) => <th key={short} scope="col" abbr={long}>{short}</th>)}</tr></thead>
    <tbody>{weeks.map(week => <tr key={week.find(Boolean)?.dayKey ?? 'empty'}>{week.map((day, index) => {
      if (day === null) return <td key={`empty-${index}`} />;
      const date = Number(day.dayKey.slice(8));
      const name = STATE_WORDS[day.state] === '' ? dayName(day.dayKey) : `${dayName(day.dayKey)}: ${STATE_WORDS[day.state]}`;
      const mark = day.state === 'inside' || day.state === 'over' || day.state === 'unknown' ? MARKS[day.state] : null;
      const face = <><span className="kairos-limits__date" aria-hidden="true">{date}</span>{mark ? <span className="kairos-limits__mark" aria-hidden="true">{mark}</span> : null}</>;
      return <td key={day.dayKey} data-day-state={day.state}>
        {mark ? <button type="button" className="kairos-limits__day" aria-label={name} aria-pressed={selected === day.dayKey} data-day={day.dayKey} onClick={() => onSelect(day.dayKey)}>{face}</button>
          : <span className="kairos-limits__day">{face}<span className="kairos-visually-hidden">{name}</span></span>}
      </td>;
    })}</tr>)}</tbody>
  </table>;
}

type State = Readonly<{ kind: 'loading' }> | Readonly<{ kind: 'error' }> | Readonly<{ kind: 'ready'; result: GoalsHistoryResult }>;

/**
 * U13 (D250, D251): the Goals page's limits calendar (green inside your limits, red over one, "?" when Kairos can't
 * tell), then "Month by month" from the same 12-month read. Loading, errors and "Try again" stay with the calendar.
 */
export function LimitsCalendar({ db, now, revision = 0 }: { readonly db: KairosDatabase; readonly now: () => string; readonly revision?: number }) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    let ignore = false;
    setState(current => (current.kind === 'error' ? current : current.kind === 'ready' ? current : { kind: 'loading' }));
    loadGoalsHistory(db, { now: now() }).then(
      result => { if (!ignore) setState({ kind: 'ready', result }); },
      () => { if (!ignore) setState({ kind: 'error' }); },
    );
    return () => { ignore = true; };
  }, [db, now, revision, attempt]);
  useEffect(() => {
    if (state.kind === 'loading' || !retrying) return;
    if (state.kind === 'ready') titleRef.current?.focus();
    setRetrying(false);
  }, [state]);

  const result = state.kind === 'ready' ? state.result : null;
  const calendar = result?.kind === 'ready' ? result.calendar : null;
  const anyLimit = result?.kind === 'ready' && (result.settings?.periods ?? []).some(period => period.goals.maxTradesPerDay !== null || period.goals.lossLimits !== null);
  const index = calendar === null ? -1 : Math.max(0, calendar.findIndex(month => month.monthKey === shown) === -1 ? calendar.length - 1 : calendar.findIndex(month => month.monthKey === shown));
  const month = calendar !== null && index >= 0 ? calendar[index] ?? null : null;
  const isThisMonth = month !== null && result?.kind === 'ready' && month.monthKey === result.todayKey.slice(0, 7);
  const selectedDay = month?.days.find(day => day.dayKey === selected) ?? null;
  const step = (by: -1 | 1) => {
    if (calendar === null) return;
    const next = calendar[index + by];
    if (next === undefined) return;
    setShown(next.monthKey);
    setSelected(null);
  };
  const homeWords = result?.kind === 'ready' ? describeTotalsInHomeCurrency(result.inHomeCurrency) : null;

  return <><Card as="section" className="kairos-goals-card kairos-limits" aria-labelledby={titleId}>
    <h2 id={titleId} ref={titleRef} tabIndex={-1}>Your limits calendar</h2>
    {state.kind === 'loading' ? <p>Loading your limits calendar…</p> : null}
    {state.kind === 'error' ? <ErrorState message="Kairos could not load your limits calendar." onRetry={() => { setRetrying(true); setAttempt(value => value + 1); }} busy={retrying} /> : null}
    {result?.kind === 'time-zone-unconfigured' ? <p>The calendar follows your daily-results time zone. Set it in Settings first.</p> : null}
    {result?.kind === 'ready' && !anyLimit ? <p>Set a limit below, such as the most you can lose in a day, to see your limits calendar.</p> : null}
    {anyLimit && month !== null ? <>
      <p>Green: you stayed inside your limits that day. Red: you went over one.</p>
      <div className="kairos-limits__months">
        <Button variant="secondary" size="sm" aria-disabled={index === 0} onClick={() => step(-1)}>Previous month</Button>
        <p className="kairos-limits__month" aria-live="polite">{monthName(month.monthKey)}</p>
        <Button variant="secondary" size="sm" aria-disabled={calendar === null || index === calendar.length - 1} onClick={() => step(1)}>Next month</Button>
      </div>
      <MonthGrid month={month} selected={selected} onSelect={dayKey => setSelected(current => (current === dayKey ? null : dayKey))} />
      <p className="kairos-goals__note">✓ Inside your limits · ! Over a limit · ? Kairos can't tell · Empty: no trades</p>
      <p>{monthName(month.monthKey)}{isThisMonth ? ' so far' : ''}: {month.inside + month.over + month.unknown > 0 ? `${days(month.inside)} inside your limits, ${month.over} over, ${month.unknown} Kairos can't tell.`
        : month.days.every(day => day.state === 'no-limits' || day.state === 'later') ? 'no limits set then.'
        : `no days with trades under your limits${isThisMonth ? ' yet' : ''}.`}</p>
      <div className="kairos-limits__details" aria-live="polite">{selectedDay !== null ? <DayDetails day={selectedDay} /> : null}</div>
      {homeWords ? <p className="kairos-goals__note">{homeWords.text} <CalendarLink to="/currency">{homeWords.link}</CalendarLink></p> : null}
    </> : null}
  </Card>
  {result?.kind === 'ready' ? <GoalsByMonth months={result.months} trend={result.trend} /> : null}</>;
}
