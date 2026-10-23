import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { describeTotalsInHomeCurrency } from '../../application/currency/currencyWords';
import type { JournalHistoryScope } from '../../application/journal';
import { describePeriodMoneyUnavailable, describeTradeCount } from '../../application/performance/periodWords';
import { loadResultsDashboard, selectResultsEntries, type ResultsDashboardProjection, type ResultsDashboardQueryResult } from '../../application/performance/resultsDashboard';
import {
  describeVisualPnlPeriodProblem,
  projectVisualPnlMonthGrid,
  projectVisualPnlResultCandles,
  shiftVisualPnlDayKey,
  startVisualPnlTimeZoneFromDevice,
  summarizeVisualPnlDailyPerformance,
  VISUAL_PNL_DEFAULT_PERIOD,
  writeVisualPnlPeriodChoice,
  type VisualPnlPeriodChoice,
  type VisualPnlTimeZoneStart,
} from '../../application/visual-pnl';
import type { KairosDatabase } from '../../data/database';
import { Button, EmptyState, ErrorState, ResultText, Skeleton, StatTile } from '../../design-system/primitives';
import { DisciplineScorePanel } from '../discipline/DisciplineScorePanel';
import { readDeviceTimeZone } from '../settings/DeviceTimeZoneButton';
import { PERIOD_LIST_ID, PeriodChooser } from './PeriodChooser';
import { ResultsCalendar } from './ResultsCalendar';
import { ResultsCandles } from './ResultsCandles';
import { ResultsDayTrades } from './ResultsDayTrades';
import { VisualPnlPerformanceSummary } from './VisualPnlPerformanceSummary';
import { VisualPnlStreak } from './VisualPnlStreak';
import './resultsDashboard.css';

export interface ResultsDashboardProps {
  readonly db: KairosDatabase;
  readonly scope: JournalHistoryScope;
  readonly choice: VisualPnlPeriodChoice;
  readonly onChoiceChange: (choice: VisualPnlPeriodChoice) => void;
  readonly renderTradeLink: (id: string) => ReactNode;
  readonly refreshRevision: number;
  readonly now?: () => string;
  readonly onFirstLoad?: () => void;
  /** D183: true (the default) gives "Result after fees" the screen's one glow; Practice passes false, because its trade form's Save button already glows (`TradeForm.tsx:474`). */
  readonly glow?: boolean;
  /** false: the dashboard's loading and first-use lines are read politely without the status role, for a page whose form's save line is its status (Practice), as Skeleton's `live`. */
  readonly live?: boolean;
  /** Tests inject a loader that fails; the app uses loadResultsDashboard. */
  readonly load?: typeof loadResultsDashboard;
}

type Answer = Readonly<{ kind: 'answer'; result: ResultsDashboardQueryResult }> | Readonly<{ kind: 'failed' }>;
type Status = 'loading' | 'ready' | 'empty' | 'error' | 'unconfigured' | 'invalid-period';

const wallClock = (): string => new Date().toISOString();
const ERROR = 'Kairos could not load your results. Your saved trades have not changed.';
const OUTCOME_WORDS = Object.freeze({ profit: 'Profit', loss: 'Loss', breakeven: 'Break-even' } as const);

/** SPA navigation inside the app, a plain link outside a router (features never import app). */
function ResultsLink({ to, children, 'aria-label': ariaLabel }: { readonly to: string; readonly children: ReactNode; readonly 'aria-label'?: string }) {
  return useInRouterContext() ? <Link to={to} aria-label={ariaLabel}>{children}</Link> : <a href={to} aria-label={ariaLabel}>{children}</a>;
}

function statusOf(answer: Answer | null): Status {
  if (answer === null) return 'loading';
  if (answer.kind === 'failed') return 'error';
  switch (answer.result.kind) {
    case 'ready': return answer.result.dashboard.entries.length === 0 ? 'empty' : 'ready';
    case 'time-zone-unconfigured': return 'unconfigured';
    case 'invalid-period': return 'invalid-period';
    case 'unavailable': return 'error';
  }
}

/** The line under "Result after fees" that names the trades blocking it, when one tap can fix it. */
function BlockedFix({ dashboard, renderTradeLink }: { readonly dashboard: ResultsDashboardProjection; readonly renderTradeLink: (id: string) => ReactNode }) {
  const { total, totalBlockers } = dashboard;
  if (total.available) return null;
  const first = (ids: readonly string[], one: string, many: (n: number) => string) => ids.length === 0 ? null
    : <p className="kairos-results__fix">{ids.length === 1 ? one : many(ids.length)} {renderTradeLink(ids[0]!)}</p>;
  if (total.reason === 'unavailable-trade-outcome') return first(totalBlockers.noResult, '1 trade has no result yet:', n => `${n} trades have no result yet. The first:`);
  if (total.reason === 'missing-currency-evidence') return first(totalBlockers.noCurrency, '1 trade has no currency:', n => `${n} trades have no currency. The first:`);
  // A missing rate is fixed through the home-currency note above, which already links "Add the missing rates".
  if (total.reason === 'mixed-currencies' && dashboard.inHomeCurrency.homeCurrency === null) return <p className="kairos-results__fix"><ResultsLink to="/currency">Choose a home currency</ResultsLink></p>;
  return null;
}

function PeriodResult({ dashboard, glow, renderTradeLink }: { readonly dashboard: ResultsDashboardProjection; readonly glow: boolean; readonly renderTradeLink: (id: string) => ReactNode }) {
  const { total, period } = dashboard;
  const value = total.available
    ? <ResultText outcome={total.outcome} label={OUTCOME_WORDS[total.outcome]} amount={total.total} currency={total.currency} />
    : <ResultText outcome="unavailable" label="Not available" amount={null} />;
  const hint = total.available
    ? `${describeTradeCount(total.tradeCount)} · ${period.label}`
    : describePeriodMoneyUnavailable(total.reason, dashboard.inHomeCurrency);
  return <>
    <dl className="kairos-stat-grid"><StatTile label="Result after fees" emphasis={glow ? 'main' : undefined} value={value} hint={hint} /></dl>
    <BlockedFix dashboard={dashboard} renderTradeLink={renderTradeLink} />
  </>;
}

/**
 * The streak, the result days, the total as candles, and the calendar with a day's trades, for one period (T-051d).
 * Keyed by the period, so a new period starts on its last month with no day open. A day's trades come from memory.
 */
function ResultsDays({ dashboard, renderTradeLink }: { readonly dashboard: ResultsDashboardProjection; readonly renderTradeLink: (id: string) => ReactNode }) {
  const { calendarMonths, period, days, todayKey, timeZone } = dashboard;
  const box = useRef<HTMLDivElement>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  /** The day whose list just opened (its heading takes focus) or closed (its button takes focus back). */
  const focusAfter = useRef<Readonly<{ kind: 'opened' | 'closed'; day: string }> | null>(null);
  const lastMonth = calendarMonths[calendarMonths.length - 1]!;
  const shownMonth = month !== null && calendarMonths.includes(month) ? month : lastMonth;
  const grid = projectVisualPnlMonthGrid({ monthKey: shownMonth, days: days.days, todayKey, period: { fromDayKey: period.fromDayKey, toDayKey: period.toDayKey } });

  useEffect(() => {
    const target = focusAfter.current;
    // Only once the state matches the press: a run that comes before the new day is shown must not use up the target.
    if (target === null || (target.kind === 'opened' ? selectedDay !== target.day : selectedDay !== null)) return;
    focusAfter.current = null;
    const element = target.kind === 'opened'
      ? box.current?.querySelector<HTMLElement>('.kairos-results-day-trades h3')
      : box.current?.querySelector<HTMLElement>(`[data-day-key="${target.day}"] button`);
    element?.focus();
  }, [selectedDay]);

  function toggleDay(day: string): void {
    const closing = day === selectedDay;
    focusAfter.current = { kind: closing ? 'closed' : 'opened', day };
    setSelectedDay(closing ? null : day);
  }
  const changeMonth = (next: string) => { setMonth(next); setSelectedDay(null); };
  const outside = grid?.days.some(day => !day.inPeriod) ?? false;
  return <div ref={box} className="kairos-results__days">
    {dashboard.currentStreak !== null ? <VisualPnlStreak projection={dashboard.currentStreak} /> : null}
    <VisualPnlPerformanceSummary summary={summarizeVisualPnlDailyPerformance(days.days)} />
    <ResultsCandles eyebrow={dashboard.scope === 'real' ? 'Your results over time' : 'Your practice results over time'} projection={projectVisualPnlResultCandles(days.days)} />
    {grid ? <ResultsCalendar
      grid={grid}
      selectedDayKey={selectedDay}
      canShowPreviousMonth={shownMonth > calendarMonths[0]!}
      canShowNextMonth={shownMonth < lastMonth}
      outsideNote={outside ? `Days outside ${period.label} are dimmed.` : null}
      onSelectDay={toggleDay}
      onPreviousMonth={() => changeMonth(grid.previousMonthKey)}
      onNextMonth={() => changeMonth(grid.nextMonthKey)}
    /> : null}
    {selectedDay !== null ? <ResultsDayTrades
      dayKey={selectedDay}
      timeZone={timeZone}
      state={{ kind: 'ready', entries: selectResultsEntries(dashboard, { fromDayKey: selectedDay, toDayKey: shiftVisualPnlDayKey(selectedDay, 1) }), conversions: dashboard.conversions }}
      renderTradeLink={renderTradeLink}
      onClose={() => toggleDay(selectedDay)}
    /> : null}
  </div>;
}

/**
 * U5 (P13.A4, D197–D201): "Your results" for one scope and period: the period chooser, the time zone (saved from this
 * device on first use, D199), the period's result after fees, and the discipline ring. Every amount and word comes from
 * an owner; this screen only shows them and never touches storage itself.
 */
export function ResultsDashboard({ db, scope, choice, onChoiceChange, renderTradeLink, refreshRevision, now = wallClock, onFirstLoad, glow = true, live = true, load = loadResultsDashboard }: ResultsDashboardProps) {
  const titleId = useId();
  const region = useRef<HTMLElement>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [zoneStart, setZoneStart] = useState<VisualPnlTimeZoneStart | null>(null);
  /** The one first-use start of this mount, shared by every load that runs before it settles; null again after a failure, so "Try again" runs it once more. */
  const started = useRef<Promise<VisualPnlTimeZoneStart> | null>(null);
  const request = useRef(0);
  const firstLoadSent = useRef(false);
  /** Set by "Try again", "Show all time" and "Show this month": after the next answer, focus goes to the period list (or the new "Try again"). */
  const placeFocus = useRef(false);
  const choiceRef = useRef(choice);
  choiceRef.current = choice;
  const nowRef = useRef(now);
  nowRef.current = now;
  const choiceKey = writeVisualPnlPeriodChoice(choice, new URLSearchParams()).toString();

  useEffect(() => {
    const mine = ++request.current;
    setBusy(true);
    (async () => {
      // A second load (a refresh, focus, or StrictMode's second effect) waits for the same start, so its
      // 'started-from-device' answer is never replaced by a later 'saved' (D199's first-use line).
      started.current ??= startVisualPnlTimeZoneFromDevice(db, readDeviceTimeZone(), nowRef.current()).then(
        start => { setZoneStart(start); return start; },
        (error: unknown) => { started.current = null; throw error; },
      );
      await started.current;
      return load(db, { choice: choiceRef.current, now: nowRef.current(), scope });
    })().then(
      result => { if (mine === request.current) { setAnswer({ kind: 'answer', result }); setBusy(false); } },
      () => { if (mine === request.current) { setAnswer({ kind: 'failed' }); setBusy(false); } },
    );
  }, [db, scope, choiceKey, refreshRevision, attempt, load]);

  const status = busy && answer === null ? 'loading' : statusOf(answer);

  useEffect(() => {
    if (busy || answer === null) return;
    if (!firstLoadSent.current) { firstLoadSent.current = true; onFirstLoad?.(); }
    if (!placeFocus.current) return;
    placeFocus.current = false;
    const list = document.getElementById(PERIOD_LIST_ID);
    const retry = region.current?.querySelector<HTMLElement>('.kairos-error-state button:not([disabled])');
    (list ?? retry)?.focus();
  }, [busy, answer, onFirstLoad]);

  const retry = () => { placeFocus.current = true; setAttempt(current => current + 1); };
  const changeAndFocus = (next: VisualPnlPeriodChoice) => { placeFocus.current = true; onChoiceChange(next); };

  const result = answer?.kind === 'answer' ? answer.result : null;
  const dashboard = result?.kind === 'ready' ? result.dashboard : null;
  const zone = dashboard?.timeZone ?? (result?.kind === 'invalid-period' ? result.timeZone : null) ?? (zoneStart !== null && zoneStart.kind !== 'unconfigured' ? zoneStart.timeZone : null);
  // The zone line comes with the first answer, never alone above the loading placeholder.
  const showZone = zone !== null && status !== 'loading' && status !== 'unconfigured';
  const practice = scope === 'practice';
  const homeWords = dashboard !== null && status === 'ready' ? describeTotalsInHomeCurrency(dashboard.inHomeCurrency) : null;
  const periodLabel = dashboard === null ? '' : dashboard.period.kind === 'all' ? (practice ? 'Practice' : 'your whole journal') : dashboard.period.label;

  return <section ref={region} className="kairos-results" aria-labelledby={titleId} data-scope={scope} data-results-status={status} aria-busy={busy || undefined}>
    <div className="kairos-results__heading">
      <p className="kairos-results__eyebrow">{practice ? 'Practice trades only' : 'Your trades'}</p>
      <h2 id={titleId}>{practice ? 'Your practice results' : 'Your results'}</h2>
    </div>
    {dashboard !== null ? <PeriodChooser period={dashboard.period} todayKey={dashboard.todayKey} onChoiceChange={onChoiceChange} /> : null}
    {zoneStart?.kind === 'started-from-device' && showZone ? <p role={live ? 'status' : undefined} aria-live={live ? undefined : 'polite'} className="kairos-results__started">Kairos set your time zone to {zoneStart.timeZone}, this device's time zone.</p> : null}
    {showZone ? <p className="kairos-results__zone"><span>Time zone: {zone}</span> <ResultsLink to="/settings" aria-label="Change your time zone">Change</ResultsLink></p> : null}
    {status === 'loading' ? <Skeleton label="Loading your results" live={live} /> : null}
    {status === 'error' ? <ErrorState message={ERROR} onRetry={retry} busy={busy} /> : null}
    {status === 'unconfigured' ? <EmptyState icon="info" headingLevel={3} title="Choose your time zone"
      message="Kairos needs your time zone to put each trade on the right day, and this device did not report one."
      action={<ResultsLink to="/settings">Open Settings</ResultsLink>} /> : null}
    {result?.kind === 'invalid-period' ? <ErrorState message={describeVisualPnlPeriodProblem(result.reason)} retryLabel="Show this month" onRetry={() => changeAndFocus(VISUAL_PNL_DEFAULT_PERIOD)} /> : null}
    {status === 'empty' && dashboard !== null ? (dashboard.period.kind !== 'all'
      ? <EmptyState icon="analysis" headingLevel={3} title={`No closed trades in ${dashboard.period.label}`} message="A trade counts here once it is closed."
        action={<Button variant="secondary" onClick={() => changeAndFocus(Object.freeze({ kind: 'all' }))}>Show all time</Button>} />
      : practice
        ? <EmptyState icon="analysis" headingLevel={3} title="No closed practice trades yet" message="A practice trade counts here once it is closed. Save one with the form above." />
        : <EmptyState icon="analysis" headingLevel={3} title="No closed trades yet" message="A trade counts here once it is closed." action={<ResultsLink to="/journal">Log a trade</ResultsLink>} />) : null}
    {status === 'ready' && dashboard !== null ? <>
      {homeWords ? <p className="kairos-results__notice" data-home-currency={dashboard.inHomeCurrency.homeCurrency}>{homeWords.text} <ResultsLink to="/currency">{homeWords.link}</ResultsLink></p> : null}
      <PeriodResult dashboard={dashboard} glow={glow} renderTradeLink={renderTradeLink} />
      <ResultsDays key={`${dashboard.period.kind}:${dashboard.period.fromDayKey ?? ''}:${dashboard.period.toDayKey ?? ''}`} dashboard={dashboard} renderTradeLink={renderTradeLink} />
      <DisciplineScorePanel title={practice ? 'Your practice discipline' : 'Your discipline'} state={dashboard.discipline} periodLabel={periodLabel} />
      {dashboard.days.blockedTrades.length > 0 ? <p className="kairos-results__notice">{dashboard.days.blockedTrades.length === 1 ? '1 closed trade could not be placed on a day.' : `${dashboard.days.blockedTrades.length} closed trades could not be placed on a day.`}</p> : null}
    </> : null}
  </section>;
}
