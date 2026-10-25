import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { describeCoachNote } from '../../application/coach/coachWords';
import { describeTotalsInHomeCurrency } from '../../application/currency/currencyWords';
import type { HomeTodayOpenTrade, HomeTodayProjection, HomeTodayResult, loadHomeToday } from '../../application/dashboard/homeToday';
import { journalListHref } from '../../application/journal/journalFilters';
import { describePeriodMoneyUnavailable } from '../../application/performance/periodWords';
import { projectVisualPnlDayKey, startVisualPnlTimeZoneFromDevice, type VisualPnlAggregationSummary, type VisualPnlMonthDayResult, type VisualPnlMonthGridDay, type VisualPnlMonthGridProjection } from '../../application/visual-pnl';
import { JOURNAL_CHANGED_EVENT, type KairosDatabase } from '../../data/database';
import { Icon, type IconName } from '../../design-system/icons/Icon';
import { Card, ErrorState, ResultText, Skeleton } from '../../design-system/primitives';
import { tradePageHref } from '../journal/tradeAddress';
import { monthLabel } from '../results/ResultsCalendar';
import { VisualPnlStreak } from '../results/VisualPnlStreak';
import { readDeviceTimeZone } from '../settings/DeviceTimeZoneButton';
import '../results/results.css';
import './today.css';

export interface TodayCardProps {
  readonly db: KairosDatabase;
  /** The current instant (UTC ISO); a stable function, so a render never reads again. */
  readonly now: () => string;
  /** Tests inject a loader; the app loads the read on demand, as the coach card does. */
  readonly load?: typeof loadHomeToday;
}

type CardState = Readonly<{ kind: 'loading' }> | Readonly<{ kind: 'failed' }> | Readonly<{ kind: 'answered'; result: HomeTodayResult }>;

const FAILED = 'Kairos could not load today. Your trades are not affected.';
const MINUTE = 60_000;
const OUTCOME_WORDS = Object.freeze({ profit: 'Profit', loss: 'Loss', breakeven: 'Break-even' } as const);
const DAY_WORDS: Readonly<Record<VisualPnlMonthDayResult, string>> = Object.freeze({ profit: 'won', loss: 'lost', breakeven: 'broke even', unavailable: 'result not available', 'no-trades': 'no trades' });
const DAY_ICONS: Readonly<Partial<Record<VisualPnlMonthDayResult, IconName>>> = Object.freeze({ profit: 'result-up', loss: 'result-down', breakeven: 'result-flat', unavailable: 'result-unknown' });
const WEEKDAYS = [['Mon', 'Monday'], ['Tue', 'Tuesday'], ['Wed', 'Wednesday'], ['Thu', 'Thursday'], ['Fri', 'Friday'], ['Sat', 'Saturday'], ['Sun', 'Sunday']] as const;
const tradesWord = (count: number): string => `${count} ${count === 1 ? 'trade' : 'trades'}`;
const loadOnDemand: typeof loadHomeToday = (db, options) => import('../../application/dashboard/homeToday').then(module => module.loadHomeToday(db, options));

/** SPA navigation inside the app, a plain link outside a router (features never import app). */
function TodayLink({ to, children }: { readonly to: string; readonly children: ReactNode }) {
  return useInRouterContext() ? <Link to={to}>{children}</Link> : <a href={to}>{children}</a>;
}

/** A result as its owner gives it: the sign, amount and currency, its word kept for screen readers; or "Not available". */
function Result({ summary }: { readonly summary: VisualPnlAggregationSummary }) {
  return summary.available
    ? <ResultText outcome={summary.outcome} label={OUTCOME_WORDS[summary.outcome]} showLabel={false} amount={summary.total} currency={summary.currency} />
    : <ResultText outcome="unavailable" label="Not available" amount={null} />;
}

/** Why the month has no total and the one tap that fixes it, in the words "Your results" uses. */
function MonthFix({ month }: { readonly month: HomeTodayProjection['month'] }) {
  const { total, totalBlockers, inHomeCurrency } = month;
  // A month with no closed trade says so on its own line; there is nothing to fix.
  if (total.available || total.tradeCount === 0) return null;
  const first = (ids: readonly string[], one: string, many: (n: number) => string) => ids.length === 0 ? null
    : <p className="kairos-today__fix">{ids.length === 1 ? one : many(ids.length)} <TodayLink to={tradePageHref(ids[0]!)}>View trade</TodayLink></p>;
  if (total.reason === 'unavailable-trade-outcome' && totalBlockers.noResult.length > 0) return first(totalBlockers.noResult, '1 trade has no result yet:', n => `${n} trades have no result yet. The first:`);
  if (total.reason === 'missing-currency-evidence' && totalBlockers.noCurrency.length > 0) return first(totalBlockers.noCurrency, '1 trade has no currency:', n => `${n} trades have no currency. The first:`);
  const words = describePeriodMoneyUnavailable(total.reason, inHomeCurrency);
  if (total.reason !== 'mixed-currencies') return <p className="kairos-today__fix">{words}</p>;
  // With a home currency, the fix is the Currency page's rates (as the results' note links them).
  const link = inHomeCurrency.homeCurrency === null ? 'Choose a home currency' : describeTotalsInHomeCurrency(inHomeCurrency)?.link ?? 'Add the missing rates';
  return <p className="kairos-today__fix">{words} <TodayLink to="/currency">{link}</TodayLink></p>;
}

/** This month's days, coloured by their result as the results calendar colours them; each day's result in words for screen readers. */
function TodayCalendar({ grid }: { readonly grid: VisualPnlMonthGridProjection }) {
  const month = monthLabel(grid.monthKey);
  const monthName = month.split(' ')[0];
  const cells: (VisualPnlMonthGridDay | null)[] = [...Array.from({ length: grid.leadingEmptyCells }, () => null), ...grid.days];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  return <table className="kairos-today-calendar">
    <caption>{month}</caption>
    <thead><tr>{WEEKDAYS.map(([short, long]) => <th key={short} scope="col" abbr={long}>{short}</th>)}</tr></thead>
    <tbody>
      {rows.map((row, rowIndex) => <tr key={rowIndex}>
        {row.map((day, dayIndex) => {
          if (day === null) return <td key={`empty-${dayIndex}`} className="kairos-today-calendar__empty" />;
          const icon = DAY_ICONS[day.result];
          return <td key={day.dayKey} data-day-key={day.dayKey} data-day-result={day.result} data-day-strength={day.strength ?? undefined} data-day-today={day.isToday || undefined}>
            <span className="kairos-today-calendar__number" aria-hidden="true">{day.dayOfMonth}</span>
            {icon !== undefined ? <Icon name={icon} size={16} className="kairos-today-calendar__icon" /> : null}
            <span className="kairos-visually-hidden">{`${day.dayOfMonth} ${monthName}${day.isToday ? ', today' : ''}: ${DAY_WORDS[day.result]}`}</span>
          </td>;
        })}
      </tr>)}
    </tbody>
  </table>;
}

/** "BTCUSDT · Long · in at 64000 · stop 62000 · target 70000": the saved plan as typed; a missing stop says so. */
function openTradeWords({ entry, inAt, stop, target }: HomeTodayOpenTrade): string {
  const { symbol, side } = entry.trade;
  const parts = [symbol, side === 'long' ? 'Long' : 'Short', inAt === null ? 'no entry saved' : `in at ${inAt}`, stop === null ? 'no stop set' : `stop ${stop}`];
  if (target !== null) parts.push(`target ${target}`);
  return parts.join(' · ');
}

function OpenTrades({ open }: { readonly open: HomeTodayProjection['openTrades'] }) {
  const titleId = useId();
  const more = open.count - open.shown.length;
  return <div className="kairos-today__open">
    <h3 id={titleId}>Open trades</h3>
    {open.count === 0 ? <p>No open trades right now.</p> : <ul className="kairos-today__trades" aria-labelledby={titleId}>
      {open.shown.map(trade => <li key={trade.entry.trade.id}><TodayLink to={tradePageHref(trade.entry.trade.id)}>{openTradeWords(trade)}</TodayLink></li>)}
    </ul>}
    {more > 0 ? <p><TodayLink to={journalListHref('real', { status: 'open' })}>{`+ ${more} more open ${more === 1 ? 'trade' : 'trades'}`}</TodayLink></p> : null}
  </div>;
}

function CoachLine({ coach }: { readonly coach: HomeTodayProjection['coach'] }) {
  if (coach === 'unavailable') return <p className="kairos-today__coach">Kairos could not load your coach. Your trades are not affected.</p>;
  if (coach === null) return <p className="kairos-today__coach">Your coach has nothing to point out this month.</p>;
  return <div className="kairos-today__coach">
    <p><span className="kairos-today__label">Your coach:</span> {describeCoachNote(coach).title}</p>
    <p><TodayLink to="/coach">See all your coach notes</TodayLink></p>
  </div>;
}

function TodayBody({ today }: { readonly today: HomeTodayProjection }) {
  const { month } = today;
  return <>
    <div className="kairos-today__results">
      {today.today === null
        ? <p className="kairos-today__line">No trades closed today yet.</p>
        : <p className="kairos-today__line"><span className="kairos-today__label">Today:</span> <Result summary={today.today} /> · {tradesWord(today.today.tradeCount)}</p>}
      {month.total.tradeCount === 0
        ? <p className="kairos-today__line">No trades closed this month yet.</p>
        : <p className="kairos-today__line"><span className="kairos-today__label">This month:</span> <Result summary={month.total} /> · {tradesWord(month.total.tradeCount)}</p>}
      <MonthFix month={month} />
    </div>
    {today.streak !== null && today.streak.outcome !== null ? <VisualPnlStreak projection={today.streak} /> : null}
    <div className="kairos-today__calendar">
      <TodayCalendar grid={today.calendar} />
      <p><TodayLink to="/analysis">See your results</TodayLink></p>
    </div>
    <OpenTrades open={today.openTrades} />
    <CoachLine coach={today.coach} />
  </>;
}

/**
 * U16 (D267): Home's "Today": today's and this month's result after fees, the streak, a small calendar of the month, the
 * open trades with their plan and the coach's first note. Every number comes from `loadHomeToday`; this card only shows
 * them. On first use it saves this device's time zone (D199). It reads again when another tab saves, when you come back
 * to the app, and when a new day starts (checked each minute).
 */
export function TodayCard({ db, now, load = loadOnDemand }: TodayCardProps) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [state, setState] = useState<CardState>({ kind: 'loading' });
  const [busy, setBusy] = useState(true);
  const [revision, setRevision] = useState(0);
  const nowRef = useRef(now);
  nowRef.current = now;
  /** The one first-use start of this mount, shared by every read that runs before it settles; null again after a failure, so "Try again" runs it once more. */
  const started = useRef<Promise<unknown> | null>(null);
  const request = useRef(0);
  /** Set by "Try again": once the answer comes, the heading takes focus (a failed answer keeps it on "Try again"). */
  const retried = useRef(false);

  useEffect(() => () => { request.current += 1; }, []);
  useEffect(() => {
    const mine = ++request.current;
    setBusy(true);
    (async () => {
      started.current ??= startVisualPnlTimeZoneFromDevice(db, readDeviceTimeZone(), nowRef.current()).catch((error: unknown) => { started.current = null; throw error; });
      await started.current;
      return load(db, { now: nowRef.current() });
    })().then(
      result => { if (mine === request.current) { setState({ kind: 'answered', result }); setBusy(false); } },
      // A read again that fails keeps what is shown; the next read tries again. "Try again" shows the failure.
      () => { if (mine === request.current) { setState(current => (current.kind === 'answered' && !retried.current ? current : { kind: 'failed' })); setBusy(false); } },
    );
  }, [db, load, revision]);

  useEffect(() => {
    const again = () => setRevision(current => current + 1);
    const visible = () => { if (!document.hidden) again(); };
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', visible);
    // D229: and when another tab saves.
    window.addEventListener(JOURNAL_CHANGED_EVENT, again);
    return () => { window.removeEventListener('focus', again); document.removeEventListener('visibilitychange', visible); window.removeEventListener(JOURNAL_CHANGED_EVENT, again); };
  }, []);

  const result = state.kind === 'answered' ? state.result : null;
  const shown = result?.kind === 'ready' ? result.projection : null;
  const shownZone = shown?.timeZone ?? null;
  const shownDay = shown?.todayKey ?? null;
  // A new day in the saved zone reads again (checked each minute while the page shows).
  useEffect(() => {
    if (shownZone === null || shownDay === null) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      const day = projectVisualPnlDayKey(nowRef.current(), shownZone);
      if (day.available && day.dayKey !== shownDay) setRevision(current => current + 1);
    }, MINUTE);
    return () => clearInterval(timer);
  }, [shownZone, shownDay]);

  useEffect(() => {
    if (busy || !retried.current) return;
    retried.current = false;
    if (state.kind !== 'failed' && result?.kind !== 'unavailable') heading.current?.focus();
  }, [busy, state, result]);
  const retry = () => { retried.current = true; setRevision(current => current + 1); };

  const failed = state.kind === 'failed' || result?.kind === 'unavailable';
  return <Card as="section" className="kairos-today" aria-labelledby={titleId} aria-busy={busy || undefined}>
    <h2 id={titleId} ref={heading} tabIndex={-1}>Today</h2>
    {state.kind === 'loading' ? <Skeleton label="Loading today" lines={3} /> : null}
    {failed ? <ErrorState message={FAILED} onRetry={retry} busy={busy} /> : null}
    {result?.kind === 'time-zone-unconfigured' ? <p>Kairos needs your time zone to show today. <TodayLink to="/settings">Open Settings</TodayLink></p> : null}
    {shown !== null && !shown.hasTrades ? <p>Your day shows here once you log a trade.</p> : null}
    {shown !== null && shown.hasTrades ? <TodayBody today={shown} /> : null}
  </Card>;
}
