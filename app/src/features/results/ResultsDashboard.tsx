import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { describeRatesFetchedOnTheirOwn, describeTotalsInHomeCurrency, RATES_NEED_A_CONNECTION } from '../../application/currency/currencyWords';
import { ecbRatesToFetchOnItsOwn, fetchMissingEcbRates, missingRateKey, type EcbReferenceRatesPort, type FetchEcbRatesResult } from '../../application/currency/ecbRates';
import type { MissingExchangeRate } from '../../application/currency/resultsInHomeCurrency';
import type { JournalHistoryScope } from '../../application/journal';
import { projectMarketTiles, type MarketTile } from '../../application/performance/marketTiles';
import { describeBiggestDip, describePeriodMoneyUnavailable, describeTradeCount } from '../../application/performance/periodWords';
import { loadResultsDashboard, projectResultsDipMarks, projectResultsTradeIdsByDay, selectResultsEntries, type ResultsDashboardProjection, type ResultsDashboardQueryResult } from '../../application/performance/resultsDashboard';
import {
  describeVisualPnlPeriodProblem,
  pickVisualPnlResultCandleUnit,
  projectVisualPnlMonthGrid,
  projectVisualPnlMonthTotals,
  projectVisualPnlResultCandlesBy,
  projectVisualPnlWeekdayTimeHeatmap,
  shiftVisualPnlDayKey,
  startVisualPnlTimeZoneFromDevice,
  summarizeVisualPnlDailyPerformance,
  VISUAL_PNL_HOUR_BLOCK_NAMES,
  VISUAL_PNL_WEEKDAY_NAMES,
  VISUAL_PNL_DEFAULT_PERIOD,
  writeVisualPnlPeriodChoice,
  type VisualPnlHeatmapCell,
  type VisualPnlMonthWeek,
  type VisualPnlResultCandleUnit,
  type VisualPnlPeriodChoice,
  type VisualPnlTimeZoneStart,
} from '../../application/visual-pnl';
import type { KairosDatabase } from '../../data/database';
import { Button, EmptyState, ErrorState, ResultText, Segmented, Skeleton, StatTile, UnavailableNotice } from '../../design-system/primitives';
import { DisciplineScorePanel } from '../discipline/DisciplineScorePanel';
import { readDeviceTimeZone } from '../settings/DeviceTimeZoneButton';
import { PERIOD_LIST_ID, PeriodChooser } from './PeriodChooser';
import { dayLabel, monthLabel, ResultsCalendar } from './ResultsCalendar';
import { ResultsCandles } from './ResultsCandles';
import { ResultsDayTrades } from './ResultsDayTrades';
import { ResultsHeatmap } from './ResultsHeatmap';
import { ResultsMarketTiles } from './ResultsMarketTiles';
import { ResultsNumbers } from './ResultsNumbers';
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
  /** D201: the bank-rates port; with it, missing rates the bank publishes are fetched once per visit. null: never fetched here. */
  readonly rates?: EcbReferenceRatesPort | null;
  /** Tests inject a loader that fails; the app uses loadResultsDashboard. */
  readonly load?: typeof loadResultsDashboard;
}

type Answer = Readonly<{ kind: 'answer'; result: ResultsDashboardQueryResult }> | Readonly<{ kind: 'failed' }>;
/** The rates fetched on their own (D201): whether a request runs, and the last outcome (kept on screen while a retry runs). */
type RatesFetch = Readonly<{ fetching: boolean; outcome: Readonly<{ kind: 'none' }> | Readonly<{ kind: 'offline' }> | Readonly<{ kind: 'answered'; result: FetchEcbRatesResult }> }>;
const NO_RATES_FETCH: RatesFetch = Object.freeze({ fetching: false, outcome: Object.freeze({ kind: 'none' as const }) });
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

/** D201: the missing rates fetched on their own, beside the currency note: "Getting…", what came back, or "Unavailable · Try again". */
function RatesLine({ state, live, onRetry }: { readonly state: RatesFetch; readonly live: boolean; readonly onRetry: () => void }) {
  const { fetching, outcome } = state;
  const statusProps = live ? { role: 'status' } : { 'aria-live': 'polite' as const };
  if (outcome.kind === 'offline') return <div className="kairos-results__rates"><UnavailableNotice message={RATES_NEED_A_CONNECTION} retryLabel="Try again" onRetry={onRetry} busy={fetching} retryWhenOnline /></div>;
  const words = outcome.kind === 'answered' ? describeRatesFetchedOnTheirOwn(outcome.result) : null;
  if (words?.tone === 'unavailable') return <div className="kairos-results__rates"><UnavailableNotice message={words.text} retryLabel="Try again" onRetry={onRetry} busy={fetching} retryWhenOnline /></div>;
  if (words?.tone === 'error') return <div className="kairos-results__rates"><ErrorState message={words.text} onRetry={onRetry} busy={fetching} /></div>;
  if (fetching) return <div className="kairos-results__rates"><p className="kairos-results__notice" {...statusProps}>Getting the missing exchange rates…</p></div>;
  if (words?.tone === 'status') return <div className="kairos-results__rates"><p className="kairos-results__notice" {...statusProps}>{words.text}</p></div>;
  return null;
}

/** The one trade list open under the calendar: a day, a week (by its first counted day), the month (T-051h) or a candle (T-051i). */
type OpenList =
  | Readonly<{ kind: 'day'; dayKey: string }> | Readonly<{ kind: 'week'; week: VisualPnlMonthWeek }> | Readonly<{ kind: 'month' }>
  | Readonly<{ kind: 'candle'; unit: VisualPnlResultCandleUnit; fromDayKey: string; toDayKey: string }>
  | Readonly<{ kind: 'cell'; cell: VisualPnlHeatmapCell }> | Readonly<{ kind: 'tile'; tile: MarketTile }>;
function listKey(list: OpenList | null): string | null {
  if (list === null) return null;
  switch (list.kind) {
    case 'day': return `day:${list.dayKey}`;
    case 'week': return `week:${list.week.fromDayKey}`;
    case 'month': return 'month';
    case 'candle': return `candle:${list.fromDayKey}:${list.unit}`;
    case 'cell': return `cell:${list.cell.weekday}-${list.cell.block}`;
    case 'tile': return `tile:${list.tile.key}`;
  }
}
/** The control that opened a list, as the calendar, the candles' numbers, the heatmap and the tiles mark it, then where focus goes when it is gone or hidden. */
function openerSelectors(list: OpenList): readonly [string, string] {
  switch (list.kind) {
    case 'day': return [`[data-day-key="${list.dayKey}"] button`, '.kairos-results-calendar__bar h3'];
    case 'week': return [`[data-week-key="${list.week.fromDayKey}"] button`, '.kairos-results-calendar__bar h3'];
    case 'month': return ['.kairos-results-calendar__month-total', '.kairos-results-calendar__bar h3'];
    case 'candle': return [`[data-candle-row="${list.fromDayKey}"] button`, '.kairos-results-candles h3'];
    case 'cell': return [`[data-heatmap-cell="${list.cell.weekday}-${list.cell.block}"] button`, '.kairos-results-heatmap h3'];
    // A symbol is the trader's own text: quotes and backslashes are escaped inside the selector.
    case 'tile': return [`[data-tile-key="${list.tile.key.replace(/["\\]/g, '\\$&')}"]`, '.kairos-results-markets h3'];
  }
}
const CANDLE_UNITS = Object.freeze([{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }] as const);

/**
 * The streak, the result days, the total as candles, the calendar, when you trade and your markets, each opening its trades
 * in the one list (T-051d, T-051h–j). Keyed by the period, so a new period starts on its last month with no list open. The
 * trades of a list come from memory.
 */
function ResultsDays({ dashboard, renderTradeLink }: { readonly dashboard: ResultsDashboardProjection; readonly renderTradeLink: (id: string) => ReactNode }) {
  const { calendarMonths, period, days, todayKey, timeZone } = dashboard;
  const box = useRef<HTMLDivElement>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenList | null>(null);
  const [unit, setUnit] = useState<VisualPnlResultCandleUnit>(() => pickVisualPnlResultCandleUnit(days.days));
  const heatmap = projectVisualPnlWeekdayTimeHeatmap(dashboard.entries, timeZone);
  const markets = projectMarketTiles(dashboard.entries);
  const candles = projectVisualPnlResultCandlesBy(days.days, { unit, tradeIdsByDay: projectResultsTradeIdsByDay(dashboard), marks: projectResultsDipMarks(dashboard) });
  /** The list that just opened (its heading takes focus) or closed (its opener takes focus back, else the month heading). */
  const focusAfter = useRef<Readonly<{ kind: 'opened' | 'closed'; key: string; opener: readonly [string, string] }> | null>(null);
  const lastMonth = calendarMonths[calendarMonths.length - 1]!;
  const shownMonth = month !== null && calendarMonths.includes(month) ? month : lastMonth;
  const bounds = { fromDayKey: period.fromDayKey, toDayKey: period.toDayKey };
  const grid = projectVisualPnlMonthGrid({ monthKey: shownMonth, days: days.days, todayKey, period: bounds });
  const totals = projectVisualPnlMonthTotals({ monthKey: shownMonth, days: days.days, period: bounds });
  const openKey = listKey(open);

  useEffect(() => {
    const target = focusAfter.current;
    // Only once the state matches the press: a run that comes before the new list is shown must not use up the target.
    if (target === null || (target.kind === 'opened' ? openKey !== target.key : openKey !== null)) return;
    focusAfter.current = null;
    const [opener, fallback] = target.opener;
    const back = box.current?.querySelector<HTMLElement>(opener);
    // A row button inside the closed "Show the numbers" can't take focus.
    const element = target.kind === 'opened'
      ? box.current?.querySelector<HTMLElement>('.kairos-results-day-trades h3')
      : back !== null && back !== undefined && back.closest('details:not([open])') === null ? back : box.current?.querySelector<HTMLElement>(fallback);
    element?.focus();
  }, [openKey]);

  function toggle(list: OpenList): void {
    const key = listKey(list)!;
    const closing = key === openKey;
    focusAfter.current = { kind: closing ? 'closed' : 'opened', key, opener: openerSelectors(list) };
    setOpen(closing ? null : list);
  }
  function close(): void {
    if (open === null) return;
    focusAfter.current = { kind: 'closed', key: openKey!, opener: openerSelectors(open) };
    setOpen(null);
  }
  /** The month button just pressed: when the new month disables it, focus goes to the other one, else the month heading (WCAG 2.4.3). */
  const pressedNav = useRef<'previous' | 'next' | null>(null);
  useEffect(() => {
    const pressed = pressedNav.current;
    pressedNav.current = null;
    if (pressed === null) return;
    const [previous, next] = [...(box.current?.querySelectorAll<HTMLButtonElement>('.kairos-results-calendar__nav') ?? [])];
    if (!(pressed === 'previous' ? previous : next)?.disabled) return;
    const other = pressed === 'previous' ? next : previous;
    (other !== undefined && !other.disabled ? other : box.current?.querySelector<HTMLElement>('.kairos-results-calendar__bar h3'))?.focus();
  }, [shownMonth]);
  const changeMonth = (next: string, pressed: 'previous' | 'next') => { pressedNav.current = pressed; setMonth(next); setOpen(null); };
  const outside = grid?.days.some(day => !day.inPeriod) ?? false;
  const changeUnit = (next: VisualPnlResultCandleUnit) => { setUnit(next); if (open?.kind === 'candle') setOpen(null); };
  const selectCandle = (index: number) => {
    if (!candles.available) return;
    const candle = candles.candles[index];
    if (candle !== undefined) toggle({ kind: 'candle', unit, fromDayKey: candle.fromDayKey, toDayKey: candle.toDayKey });
  };
  const list = (() => {
    if (open === null) return null;
    if (open.kind === 'day') return { dayKey: open.dayKey, title: undefined, entries: selectResultsEntries(dashboard, { fromDayKey: open.dayKey, toDayKey: shiftVisualPnlDayKey(open.dayKey, 1) }) };
    if (open.kind === 'week') {
      const { fromDayKey, toDayKey, dayKeys } = open.week;
      if (fromDayKey === null || toDayKey === null) return null;
      const last = dayKeys[dayKeys.length - 1]!;
      const title = fromDayKey === last ? `Trades closed on ${dayLabel(fromDayKey)}` : `Trades closed from ${dayLabel(fromDayKey).split(' ')[0]} to ${dayLabel(last)}`;
      return { dayKey: fromDayKey, title, entries: selectResultsEntries(dashboard, { fromDayKey, toDayKey }) };
    }
    if (open.kind === 'cell') {
      const { weekday, block, tradeIds } = open.cell;
      return { dayKey: '', title: `Trades opened on ${VISUAL_PNL_WEEKDAY_NAMES[weekday]}, ${VISUAL_PNL_HOUR_BLOCK_NAMES[block]}`, entries: selectResultsEntries(dashboard, { tradeIds }) };
    }
    if (open.kind === 'tile') {
      const { symbol, tradeIds } = open.tile;
      return { dayKey: '', title: symbol === null ? 'Trades in other markets' : `Trades in ${symbol}`, entries: selectResultsEntries(dashboard, { tradeIds }) };
    }
    if (open.kind === 'candle') {
      const title = open.unit === 'day' ? `Trades closed on ${dayLabel(open.fromDayKey)}` : open.unit === 'week' ? `Trades closed in the week of ${dayLabel(open.fromDayKey)}` : `Trades closed in ${monthLabel(open.fromDayKey.slice(0, 7))}`;
      return { dayKey: open.fromDayKey, title, entries: selectResultsEntries(dashboard, { fromDayKey: open.fromDayKey, toDayKey: open.toDayKey }) };
    }
    if (totals === null || totals.monthFromDayKey === null || totals.monthToDayKey === null) return null;
    return { dayKey: totals.monthFromDayKey, title: `Trades closed in ${monthLabel(shownMonth)}`, entries: selectResultsEntries(dashboard, { fromDayKey: totals.monthFromDayKey, toDayKey: totals.monthToDayKey }) };
  })();
  // One list at a time on the whole dashboard, shown under the section it came from.
  const listView = list === null ? null : <ResultsDayTrades
    dayKey={list.dayKey}
    title={list.title}
    showDay={open?.kind !== 'day' && !(open?.kind === 'candle' && open.unit === 'day')}
    timeZone={timeZone}
    state={{ kind: 'ready', entries: list.entries, conversions: dashboard.conversions }}
    renderTradeLink={renderTradeLink}
    onClose={close}
  />;
  return <div ref={box} className="kairos-results__days">
    {dashboard.currentStreak !== null ? <VisualPnlStreak projection={dashboard.currentStreak} /> : null}
    <VisualPnlPerformanceSummary summary={summarizeVisualPnlDailyPerformance(days.days)} />
    <ResultsCandles
      eyebrow={dashboard.scope === 'real' ? 'Your results over time' : 'Your practice results over time'}
      title={period.kind === 'all' ? 'Total result so far' : `Your total in ${period.label}`}
      projection={candles}
      onSelectCandle={selectCandle}
      dip={describeBiggestDip(dashboard.summary.biggestDip, dashboard.inHomeCurrency)}
      controls={<Segmented label="Candles" options={CANDLE_UNITS} value={unit} onChange={changeUnit} />}
      note={period.kind === 'all' || period.fromDayKey === null ? null : `It starts at 0 on ${dayLabel(period.fromDayKey)}.`}
    />
    {grid ? <ResultsCalendar
      grid={grid}
      totals={totals}
      selectedDayKey={open?.kind === 'day' ? open.dayKey : null}
      selectedWeekKey={open?.kind === 'week' ? open.week.fromDayKey : null}
      monthSelected={open?.kind === 'month'}
      canShowPreviousMonth={shownMonth > calendarMonths[0]!}
      canShowNextMonth={shownMonth < lastMonth}
      outsideNote={outside ? `Days outside ${period.label} are dimmed.` : null}
      onSelectDay={dayKey => toggle({ kind: 'day', dayKey })}
      onSelectWeek={week => toggle({ kind: 'week', week })}
      onSelectMonth={() => toggle({ kind: 'month' })}
      onPreviousMonth={() => changeMonth(grid.previousMonthKey, 'previous')}
      onNextMonth={() => changeMonth(grid.nextMonthKey, 'next')}
    /> : null}
    {list !== null && open?.kind !== 'cell' && open?.kind !== 'tile' ? listView : null}
    <ResultsHeatmap heatmap={heatmap} timeZone={timeZone} selectedKey={open?.kind === 'cell' ? `${open.cell.weekday}-${open.cell.block}` : null} onSelectCell={cell => toggle({ kind: 'cell', cell })} />
    {list !== null && open?.kind === 'cell' ? listView : null}
    <ResultsMarketTiles markets={markets} selectedKey={open?.kind === 'tile' ? open.tile.key : null} onSelectTile={tile => toggle({ kind: 'tile', tile })} />
    {list !== null && open?.kind === 'tile' ? listView : null}
  </div>;
}

/**
 * U5 (P13.A4, D197–D201): "Your results" for one scope and period: the period chooser, the time zone (saved from this
 * device on first use, D199), the period's result after fees, and the discipline ring. Every amount and word comes from
 * an owner; this screen only shows them and never touches storage itself.
 */
export function ResultsDashboard({ db, scope, choice, onChoiceChange, renderTradeLink, refreshRevision, now = wallClock, onFirstLoad, glow = true, live = true, rates = null, load = loadResultsDashboard }: ResultsDashboardProps) {
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
  /** The missing rates already asked for during this visit (one request per missing rate, D201). */
  const asked = useRef(new Set<string>());
  const [ratesFetch, setRatesFetch] = useState<RatesFetch>(NO_RATES_FETCH);
  /** Bumped after rates were saved: reloads the dashboard with the same choice. */
  const [ratesRevision, setRatesRevision] = useState(0);
  /** The running request and the rates it asks for; a newer request takes them over, so a period change never drops them. */
  const ratesRunning = useRef<Readonly<{ controller: AbortController; pairs: readonly MissingExchangeRate[] }> | null>(null);
  /** Set by a tap on the rates' "Try again" to the state it was tapped in: after a newer answer, focus goes to the currency note's link, or the new "Try again". */
  const ratesFocus = useRef<RatesFetch | null>(null);
  useEffect(() => () => ratesRunning.current?.controller.abort(), []);

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
  }, [db, scope, choiceKey, refreshRevision, attempt, ratesRevision, load]);

  // D201: after a ready answer, ask the bank once for the missing rates it publishes; offline, wait for a tap or for "online".
  function fetchRates(missing: readonly MissingExchangeRate[]): void {
    if (rates === null) return;
    const running = ratesRunning.current;
    if (running === null && ecbRatesToFetchOnItsOwn(missing, new Set()).length === 0) {
      // Nothing on screen comes from the bank: a line about other rates goes, except "Got N", which told of this reload.
      setRatesFetch(current => (current.outcome.kind === 'offline' || (current.outcome.kind === 'answered' && !(current.outcome.result.ok && current.outcome.result.saved > 0)) ? NO_RATES_FETCH : current));
      return;
    }
    const fresh = ecbRatesToFetchOnItsOwn(missing, asked.current);
    if (fresh.length === 0) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setRatesFetch({ fetching: false, outcome: { kind: 'offline' } }); return; }
    for (const pair of fresh) asked.current.add(missingRateKey(pair));
    const pairs = running === null ? fresh : [...running.pairs, ...fresh];
    running?.controller.abort();
    const controller = new AbortController();
    ratesRunning.current = { controller, pairs };
    setRatesFetch(current => ({ fetching: true, outcome: current.outcome }));
    void fetchMissingEcbRates(db, rates, pairs, { now: nowRef.current(), signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      ratesRunning.current = null;
      setRatesFetch({ fetching: false, outcome: { kind: 'answered', result } });
      if (result.ok && result.saved > 0) setRatesRevision(current => current + 1);
    });
  }
  const missingRates = answer?.kind === 'answer' && answer.result.kind === 'ready' ? answer.result.dashboard.inHomeCurrency.missing : null;
  useEffect(() => {
    if (busy || missingRates === null) return;
    fetchRates(missingRates);
  }, [busy, missingRates]); // eslint-disable-line react-hooks/exhaustive-deps
  function retryRates(): void {
    // The notice's "online" listener calls this too: never while a request runs, and focus moves only from the notice itself.
    if (missingRates === null || ratesRunning.current !== null) return;
    const active = typeof document === 'undefined' ? null : document.activeElement;
    ratesFocus.current = active !== null && (region.current?.querySelector('.kairos-results__rates')?.contains(active) ?? false) ? ratesFetch : null;
    for (const pair of missingRates) asked.current.delete(missingRateKey(pair));
    fetchRates(missingRates);
  }
  // After the rates' "Try again", focus goes to the currency note's link, or to the new "Try again" (WCAG 2.4.3).
  useEffect(() => {
    // React may run this for the screen the tap was made on, after the tap: only a newer answer moves focus.
    const tapped = ratesFocus.current;
    if (tapped === null || ratesFetch === tapped || ratesFetch.fetching || busy) return;
    ratesFocus.current = null;
    const link = region.current?.querySelector<HTMLElement>('.kairos-results__notice a[href]');
    const retry = region.current?.querySelector<HTMLElement>('.kairos-results__rates .kairos-error-state button:not([disabled])');
    (retry ?? link)?.focus();
  }, [ratesFetch, busy]);

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
      <RatesLine state={ratesFetch} live={live} onRetry={retryRates} />
      <PeriodResult dashboard={dashboard} glow={glow} renderTradeLink={renderTradeLink} />
      <ResultsNumbers summary={dashboard.summary} context={dashboard.inHomeCurrency} renderTradeLink={renderTradeLink} />
      <ResultsDays key={`${dashboard.period.kind}:${dashboard.period.fromDayKey ?? ''}:${dashboard.period.toDayKey ?? ''}`} dashboard={dashboard} renderTradeLink={renderTradeLink} />
      <DisciplineScorePanel title={practice ? 'Your practice discipline' : 'Your discipline'} state={dashboard.discipline} periodLabel={periodLabel} />
      {dashboard.days.blockedTrades.length > 0 ? <p className="kairos-results__notice">{dashboard.days.blockedTrades.length === 1 ? '1 closed trade could not be placed on a day.' : `${dashboard.days.blockedTrades.length} closed trades could not be placed on a day.`}</p> : null}
    </> : null}
  </section>;
}
