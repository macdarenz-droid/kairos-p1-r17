import { useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { describeCoachNote } from '../../application/coach/coachWords';
import { describeTotalsInHomeCurrency } from '../../application/currency/currencyWords';
import type { HomeTodayOpenTrade, HomeTodayProjection, HomeTodayResult, loadHomeToday } from '../../application/dashboard/homeToday';
import { describeCalendarMoment } from '../../application/economic-calendar/calendarWords';
import { isNewsRefreshDue, refreshNewsCalendar, type NewsApiPort } from '../../application/economic-calendar/fetchedNews';
import type { NextBigNews } from '../../application/economic-calendar/nextBigNews';
import { journalListHref } from '../../application/journal/journalFilters';
import { describePriceNowFailure, type PriceNowResult } from '../../application/market-reference/priceNow';
import { describeUpdatedAgo } from '../../application/online/onlineWords';
import type { RequestBudget } from '../../application/online/requestBudget';
import { describePeriodMoneyUnavailable } from '../../application/performance/periodWords';
import { describeTimesRisked } from '../../application/performance/tradeRisk';
import { projectOpenTradeNow } from '../../application/trades/openTradeNow';
import { projectVisualPnlDayKey, startVisualPnlTimeZoneFromDevice, type VisualPnlAggregationSummary, type VisualPnlMonthDayResult, type VisualPnlMonthGridDay, type VisualPnlMonthGridProjection } from '../../application/visual-pnl';
import { JOURNAL_CHANGED_EVENT, type KairosDatabase } from '../../data/database';
import { NEWS_CALENDAR_SOURCE_IDS } from '../../domain/economic-calendar/newsSources';
import { Icon, type IconName } from '../../design-system/icons/Icon';
import { Button, Card, ErrorState, ResultText, Skeleton } from '../../design-system/primitives';
import { tradePageHref } from '../journal/tradeAddress';
import { TradeFormMarketContext, type TradeFormMarket } from '../journal/tradeFormMarket';
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
  /** The Kairos server's news routes (D269), as the News page gets them; without them the saved news still shows. */
  readonly news?: NewsApiPort;
  /**
   * T-061e review r1: Home's shared request budget on the Kairos server; the background news refresh (one request per
   * official calendar) waits in it, so it never shares a minute with more of Home's market reads than the server allows.
   */
  readonly budget?: RequestBudget | null;
}

/** The last answer (null before the first) and whether the last read failed; a failed read always shows (D267). */
type CardState = Readonly<{ answer: HomeTodayResult | null; failed: boolean }>;
/** What asked for a read: coming back to the app (focus, the page shown again) or anything else. */
type ReadCause = 'return' | 'other';

const FAILED = 'Kairos could not load today. Your trades are not affected.';
const MINUTE = 60_000;
/** D269: the background news refresh waits this long after the first read, so Home shows first. */
const NEWS_REFRESH_DELAY_MS = 10_000;
const NO_RESULT_AT_PRICE = "Kairos can't work out a result at this price.";
const SOURCE_DOWN: PriceNowResult = Object.freeze({ ok: false as const, why: 'source-down' as const, retryAfterSeconds: null, note: null, source: Object.freeze({ provider: 'binance' as const }) });
/**
 * When Home last started a background news refresh with each port (the app has one). A refresh is 9 requests and the
 * server allows 30 a minute without a device; so, whatever its outcome, Home starts at most one per port every 30
 * minutes (the News page's own rule), however often Home opens.
 */
const lastHomeNewsRefresh = new WeakMap<NewsApiPort, string>();
/**
 * T-061e review r1: each market's last price-now read by the price port (the app has one): when it was asked, its
 * answer once it came, and the read itself. A read outlives the Home that asked; a market that shows again within a
 * minute (Home left and opened again) takes that read instead of asking again, so each market is asked at most once
 * a minute however often Home opens.
 */
type PriceRead = { readonly askedAtMs: number; answer: PriceNowResult | null; readonly result: Promise<PriceNowResult>; readonly controller: AbortController };
const recentPricesNow = new WeakMap<object, Map<string, PriceRead>>();
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
  // With a home currency, the home-currency note under the month links the Currency page (HomeCurrencyNote).
  if (total.reason !== 'mixed-currencies' || inHomeCurrency.homeCurrency !== null) return <p className="kairos-today__fix">{words}</p>;
  return <p className="kairos-today__fix">{words} <TodayLink to="/currency">Choose a home currency</TodayLink></p>;
}

/** T-045h: beside a total in the home currency, the note that says so, with its link to the Currency page, as "Your results" shows it. */
function HomeCurrencyNote({ month }: { readonly month: HomeTodayProjection['month'] }) {
  const words = month.total.tradeCount === 0 ? null : describeTotalsInHomeCurrency(month.inHomeCurrency);
  return words === null ? null : <p className="kairos-today__fix" data-home-currency={month.inHomeCurrency.homeCurrency}>{words.text} <TodayLink to="/currency">{words.link}</TodayLink></p>;
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

type PriceNow = NonNullable<TradeFormMarket['priceNow']>;
type PriceAsk = Parameters<PriceNow>[0];
/** The last answer for one market (null before the first) and whether a read for it is on its way. */
type MarketPrice = Readonly<{ answer: PriceNowResult | null; reading: boolean }>;
const NOT_READ: MarketPrice = Object.freeze({ answer: null, reading: false });
const priceKey = ({ marketType, symbol }: PriceAsk): string => `${marketType}:${symbol}`;

/**
 * U16 (D268): the price now of the shown open trades' markets, one read per market however many shown trades share it.
 * Each market is read when it first shows, every minute while the page shows and the device is online, and when the
 * device is back online; a minute missed while the page was hidden is read when it shows again. A market shown again
 * within a minute of its last read (Home opened again) takes that read (review r1: the server's limit). After a source says
 * it is busy, nothing is asked of that market until the wait it asked for has passed, except by "Try again". When an
 * answer takes away the "Try again" that had focus, the trade's link takes it (focus never falls to the page).
 */
function usePricesNow(asks: readonly PriceAsk[], read: PriceNow | undefined, list: RefObject<HTMLUListElement | null>) {
  const [prices, setPrices] = useState<ReadonlyMap<string, MarketPrice>>(() => new Map());
  const asked = useRef<ReadonlyMap<string, PriceAsk>>(new Map());
  asked.current = new Map(asks.map(ask => [priceKey(ask), ask]));
  // One text for the markets shown (symbols are free text, so no separator character is safe).
  const keysText = JSON.stringify([...asked.current.keys()]);
  /** The markets read so far in this mount of the reader. */
  const shown = useRef<ReadonlySet<string>>(new Set());
  /** Set by the reading effect: read one market ("Try again" does not wait for a busy source), or let one go. */
  const reader = useRef<Readonly<{ read: (key: string, byTrader: boolean, firstShow?: boolean) => void; stop: (key: string) => void }> | null>(null);
  /** The open trade whose price line had focus when an answer came: its link takes focus if the answer took it away. */
  const refocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (read === undefined) return;
    let alive = true;
    /** The read each shown market waits for in this mount (a newer one replaces it). */
    const waiting = new Map<string, PriceRead>();
    const busyUntil = new Map<string, number>();
    let reads = recentPricesNow.get(read);
    if (reads === undefined) { reads = new Map(); recentPricesNow.set(read, reads); }
    const kept = reads;
    let missed = false;
    const show = (key: string, entry: PriceRead, answer: PriceNowResult) => {
      if (!alive || waiting.get(key) !== entry) return;
      if (!answer.ok && answer.retryAfterSeconds !== null) busyUntil.set(key, entry.askedAtMs + answer.retryAfterSeconds * 1000);
      else busyUntil.delete(key);
      const active = document.activeElement;
      if (active !== null && active.closest('.kairos-today__price') !== null && (list.current?.contains(active) ?? false)) refocus.current = active.closest('li');
      setPrices(current => new Map(current).set(key, { answer, reading: false }));
    };
    const readMarket = (key: string, byTrader: boolean, firstShow = false) => {
      const ask = asked.current.get(key);
      if (ask === undefined || (!byTrader && (busyUntil.get(key) ?? 0) > Date.now())) return;
      const last = kept.get(key);
      // Shown again within a minute of its last read: that read, no new one (an offline answer only while still offline).
      const reuse = firstShow && !byTrader && last !== undefined && Date.now() - last.askedAtMs < MINUTE
        && (last.answer === null || last.answer.ok || last.answer.why !== 'offline' || navigator.onLine === false);
      let entry: PriceRead;
      if (reuse) entry = last;
      else {
        // A newer read ("Try again", the minute) replaces one still on its way.
        if (last !== undefined && last.answer === null) last.controller.abort();
        const controller = new AbortController();
        const result = read(ask, controller.signal).catch(() => SOURCE_DOWN);
        const fresh: PriceRead = { askedAtMs: Date.now(), answer: null, result, controller };
        void result.then(answer => { fresh.answer = answer; });
        kept.set(key, fresh);
        entry = fresh;
      }
      waiting.set(key, entry);
      const answered = entry.answer;
      if (answered !== null) { show(key, entry, answered); return; }
      setPrices(current => new Map(current).set(key, { answer: current.get(key)?.answer ?? null, reading: true }));
      void entry.result.then(answer => show(key, entry, answer));
    };
    const readAll = () => { for (const key of asked.current.keys()) readMarket(key, false); };
    const whenShown = () => { if (document.hidden) missed = true; else readAll(); };
    const visible = () => { if (!document.hidden && missed) { missed = false; readAll(); } };
    reader.current = Object.freeze({
      read: (key: string, byTrader: boolean, firstShow?: boolean) => { if (!byTrader && document.hidden) missed = true; else readMarket(key, byTrader, firstShow); },
      stop: (key: string) => {
        // A market no longer shown is let go: its read on its way stops and is not kept.
        const entry = waiting.get(key);
        waiting.delete(key);
        busyUntil.delete(key);
        if (entry !== undefined && entry.answer === null) { entry.controller.abort(); if (kept.get(key) === entry) kept.delete(key); }
      },
    });
    const timer = setInterval(() => { if (navigator.onLine !== false) whenShown(); }, MINUTE);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', whenShown);
    return () => {
      // Reads on their way finish and are kept for a quick return; this mount just stops listening.
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', whenShown);
      reader.current = null;
      shown.current = new Set();
      setPrices(new Map());
    };
  }, [read, list]);

  // A market that starts to show is read at once; one that no longer shows is let go.
  useEffect(() => {
    const current = reader.current;
    if (current === null) return;
    const now = new Set(JSON.parse(keysText) as string[]);
    for (const key of shown.current) {
      if (now.has(key)) continue;
      current.stop(key);
      setPrices(prices => { const next = new Map(prices); next.delete(key); return next; });
    }
    for (const key of now) if (!shown.current.has(key)) current.read(key, false, true);
    shown.current = now;
  }, [read, keysText]);

  // In the commit that shows the answer (a layout effect), before anything else can run.
  useLayoutEffect(() => {
    const trade = refocus.current;
    refocus.current = null;
    const active = document.activeElement;
    if (trade !== null && trade.isConnected && (active === null || active === document.body)) trade.querySelector<HTMLElement>('a')?.focus();
  }, [prices]);

  return {
    price: (ask: PriceAsk): MarketPrice => prices.get(priceKey(ask)) ?? NOT_READ,
    retry: (ask: PriceAsk): void => reader.current?.read(priceKey(ask), true),
  };
}

/**
 * U16 (D268): the price now under one shown open trade and how the trade would stand if it closed at that price
 * (`projectOpenTradeNow`), or why there is no price, with "Try again" when it can help. The price is market data: never
 * saved, never in a total (rule 7).
 */
function OpenTradeNowLine({ entry, price, onRetry }: { readonly entry: HomeTodayOpenTrade['entry']; readonly price: MarketPrice; readonly onRetry: () => void }) {
  const { answer, reading } = price;
  if (answer === null) return null;
  if (!answer.ok) {
    const failure = describePriceNowFailure(answer);
    return <p className="kairos-today__price">{failure.message}
      {failure.retry ? <> <Button variant="ghost" size="sm" aria-disabled={reading || undefined} aria-busy={reading || undefined}
        onClick={() => { if (!reading) onRetry(); }}>Try again</Button></> : null}</p>;
  }
  const now = projectOpenTradeNow(entry, answer);
  const times = now.ok && now.timesRisked !== null ? describeTimesRisked(now.timesRisked) : null;
  return <p className="kairos-today__price">
    {`Price now ${answer.price}${answer.quote === null ? '' : ` ${answer.quote}`} (market, not saved) · `}
    {now.ok
      ? <>If you closed now <ResultText outcome={now.outcome} label={OUTCOME_WORDS[now.outcome]} showLabel={false} amount={now.amount} currency={now.currency} />{times === null ? null : ` · ${times}`}</>
      : NO_RESULT_AT_PRICE}
  </p>;
}

function OpenTrades({ open, priceNow }: { readonly open: HomeTodayProjection['openTrades']; readonly priceNow: PriceNow | undefined }) {
  const titleId = useId();
  const list = useRef<HTMLUListElement>(null);
  const more = open.count - open.shown.length;
  const prices = usePricesNow(open.shown.map(({ entry }) => ({ marketType: entry.trade.marketType, symbol: entry.trade.symbol })), priceNow, list);
  return <div className="kairos-today__open">
    <h3 id={titleId}>Open trades</h3>
    {open.count === 0 ? <p>No open trades right now.</p> : <ul ref={list} className="kairos-today__trades" aria-labelledby={titleId}>
      {open.shown.map(({ entry, ...trade }) => {
        const ask = { marketType: entry.trade.marketType, symbol: entry.trade.symbol };
        return <li key={entry.trade.id}>
          <TodayLink to={tradePageHref(entry.trade.id)}>{openTradeWords({ entry, ...trade })}</TodayLink>
          {priceNow === undefined ? null : <OpenTradeNowLine entry={entry} price={prices.price(ask)} onRetry={() => prices.retry(ask)} />}
        </li>;
      })}
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

/**
 * D269: the next big news and when the official schedules were last fetched, or why the news could not be read; always
 * with "Open the news calendar" in the same place, so a link that has focus keeps it when the card reads again.
 */
function NewsLines({ news, nowMs }: { readonly news: NextBigNews | 'unavailable'; readonly nowMs: number }) {
  const ago = news === 'unavailable' || news.refreshedAt === null ? null : describeUpdatedAgo(nowMs - Date.parse(news.refreshedAt));
  const checked = news === 'unavailable' ? null : news.refreshedAt === null ? "Kairos hasn't got the official schedules yet." : ago === null ? null : `News checked ${ago}`;
  return <div className="kairos-today__news">
    {news === 'unavailable'
      ? <p>Kairos could not load the news. Your trades are not affected.</p>
      : news.next === null
        ? <p className="kairos-today__line">No big news in the next 14 days.</p>
        : <p className="kairos-today__line"><span className="kairos-today__label">Next big news:</span> {news.next.name} · {describeCalendarMoment(news.next.event.startsAt, news.timeZone)}</p>}
    {checked === null ? null : <p className="kairos-today__checked">{checked}</p>}
    <p><TodayLink to="/news-calendar">Open the news calendar</TodayLink></p>
  </div>;
}

function TodayBody({ today, priceNow }: { readonly today: HomeTodayProjection; readonly priceNow: PriceNow | undefined }) {
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
      <HomeCurrencyNote month={month} />
    </div>
    {today.streak !== null && today.streak.outcome !== null ? <VisualPnlStreak projection={today.streak} /> : null}
    <div className="kairos-today__calendar">
      <TodayCalendar grid={today.calendar} />
      <p><TodayLink to="/analysis">See your results</TodayLink></p>
    </div>
    <OpenTrades open={today.openTrades} priceNow={priceNow} />
    <CoachLine coach={today.coach} />
  </>;
}

/**
 * U16 (D267): Home's "Today": today's and this month's result after fees, the streak, a small calendar of the month, the
 * open trades with their plan and the price now (D268, with the app's market port), the coach's first note and the next
 * big news (D269, also before the first trade). Every number comes from its owner; this card only shows them. On first
 * use it saves this device's time zone (D199). It reads again when another tab saves, when you come back to the app,
 * when a new day starts (checked each minute) and after fresh official schedules came in the background, never while the
 * page is hidden; any read that fails says so, with "Try again", in place of the last numbers and news.
 */
export function TodayCard({ db, now, load = loadOnDemand, news, budget = null }: TodayCardProps) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  /** The card itself (the heading's section). */
  const box = (): HTMLElement | null => heading.current?.closest<HTMLElement>('.kairos-today') ?? null;
  const [state, setState] = useState<CardState>({ answer: null, failed: false });
  const [busy, setBusy] = useState(true);
  const [revision, setRevision] = useState(0);
  const nowRef = useRef(now);
  nowRef.current = now;
  /** The one first-use start of this mount, shared by every read that runs before it settles; null again after a failure, so "Try again" runs it once more. */
  const started = useRef<Promise<unknown> | null>(null);
  const request = useRef(0);
  /** A read is running, and what asked for it; asks that come meanwhile make one more read after it (`pending`). */
  const running = useRef(true);
  const runningCause = useRef<ReadCause>('other');
  const pending = useRef(false);
  /** Set by "Try again": once the answer comes, the heading takes focus (a failed answer keeps it on "Try again"). */
  const retried = useRef(false);
  /** A failed read took away the part that had focus: "Try again" takes it (focus never falls to the page). */
  const refocusRetry = useRef(false);

  /**
   * One more read, never while the page is hidden (coming back reads). A read already running takes it in: coming back
   * while a read for coming back runs needs nothing more ("visibilitychange" and "focus" come together); anything else
   * makes one more read after it, however many asks come meanwhile.
   */
  const readAgain = useRef((cause: ReadCause): void => {
    if (document.hidden) return;
    if (running.current) {
      if (!(cause === 'return' && runningCause.current === 'return')) pending.current = true;
      return;
    }
    running.current = true;
    runningCause.current = cause;
    setRevision(current => current + 1);
  });
  /** Without the app shell's market port (or its price now), no price line shows. */
  const priceNow = useContext(TradeFormMarketContext)?.priceNow;
  /** Moves each minute while the page shows, so "News checked 3 min ago" stays true. */
  const [, setMinute] = useState(0);

  useEffect(() => () => { request.current += 1; }, []);
  useEffect(() => {
    const mine = ++request.current;
    running.current = true;
    setBusy(true);
    const settle = (answer: HomeTodayResult | null): void => {
      if (mine !== request.current) return;
      running.current = false;
      if (answer === null) {
        const active = document.activeElement;
        refocusRetry.current = active !== null && active !== heading.current && (box()?.contains(active) ?? false) && active.closest('.kairos-error-state') === null;
        setState(current => ({ answer: current.answer, failed: true }));
      } else {
        // A read that works takes the failure box away: focus on "Try again" (or on its box while busy) goes to the heading.
        const active = document.activeElement;
        if (active !== null && (box()?.contains(active) ?? false) && active.closest('.kairos-error-state') !== null) retried.current = true;
        setState({ answer, failed: false });
      }
      setBusy(false);
      if (pending.current) { pending.current = false; readAgain.current('other'); }
    };
    (async () => {
      started.current ??= startVisualPnlTimeZoneFromDevice(db, readDeviceTimeZone(), nowRef.current()).catch((error: unknown) => { started.current = null; throw error; });
      await started.current;
      return load(db, { now: nowRef.current() });
    })().then(settle, () => settle(null));
  }, [db, load, revision]);

  useEffect(() => {
    const changed = () => readAgain.current('other');
    const back = () => readAgain.current('return');
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    // D229: and when another tab saves.
    window.addEventListener(JOURNAL_CHANGED_EVENT, changed);
    return () => { window.removeEventListener('focus', back); document.removeEventListener('visibilitychange', back); window.removeEventListener(JOURNAL_CHANGED_EVENT, changed); };
  }, []);

  const { answer: result, failed: readFailed } = state;
  const last = result?.kind === 'ready' ? result.projection : null;
  const shownZone = last?.timeZone ?? null;
  const shownDay = last?.todayKey ?? null;
  // A new day in the saved zone reads again (checked each minute while the page shows).
  useEffect(() => {
    if (shownZone === null || shownDay === null) return;
    const timer = setInterval(() => {
      if (!document.hidden) setMinute(current => current + 1);
      const day = projectVisualPnlDayKey(nowRef.current(), shownZone);
      if (day.available && day.dayKey !== shownDay) readAgain.current('other');
    }, MINUTE);
    return () => clearInterval(timer);
  }, [shownZone, shownDay]);

  const failed = readFailed || result?.kind === 'unavailable';
  // A failed read shows the failure, never the last numbers or news as if they were current (D267).
  const shown = failed ? null : last;

  // D269: when the News page's 30-minute rule says the official schedules are due and the server is set up, get them
  // once in the background, 10 s after the first read that shows the news (and not while the page is hidden), then read
  // again. A failure writes nothing, so the saved copy stays.
  const shownNews = shown !== null && shown.news !== 'unavailable' ? shown.news : null;
  const newsDue = news !== undefined && news.setUp && shownNews !== null && isNewsRefreshDue(shownNews.refreshedAt, nowRef.current());
  const newsAsked = useRef(false);
  useEffect(() => {
    if (!newsDue || news === undefined || newsAsked.current) return;
    const controller = new AbortController();
    let waiting: (() => void) | null = null;
    const run = () => {
      newsAsked.current = true;
      const at = nowRef.current();
      if (!isNewsRefreshDue(lastHomeNewsRefresh.get(news) ?? null, at)) return;
      lastHomeNewsRefresh.set(news, at);
      // All the calendars at once, when they fit in Home's request budget (they wait for recent market reads to age).
      const room = budget === null ? Promise.resolve(true) : budget.take(NEWS_CALENDAR_SOURCE_IDS.length, controller.signal);
      void room.then(granted => {
        if (!granted || controller.signal.aborted) return;
        void refreshNewsCalendar(db, news, { now: budget === null ? at : nowRef.current(), signal: controller.signal }).then(outcome => {
          if (!controller.signal.aborted && outcome.ok) readAgain.current('other');
        });
      });
    };
    const timer = setTimeout(() => {
      if (!document.hidden) { run(); return; }
      const whenShown = () => {
        if (document.hidden) return;
        document.removeEventListener('visibilitychange', whenShown);
        waiting = null;
        run();
      };
      waiting = whenShown;
      document.addEventListener('visibilitychange', whenShown);
    }, NEWS_REFRESH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      if (waiting !== null) document.removeEventListener('visibilitychange', waiting);
      controller.abort();
    };
  }, [db, news, newsDue, budget]);

  useEffect(() => {
    if (busy) return;
    if (refocusRetry.current) {
      refocusRetry.current = false;
      if (failed) box()?.querySelector<HTMLElement>('.kairos-error-state button')?.focus();
    }
    if (!retried.current) return;
    retried.current = false;
    if (!failed) heading.current?.focus();
  }, [busy, failed, state]);
  const retry = () => { retried.current = true; readAgain.current('other'); };

  return <Card as="section" className="kairos-today" aria-labelledby={titleId} aria-busy={busy || undefined}>
    <h2 id={titleId} ref={heading} tabIndex={-1}>Today</h2>
    {result === null && !readFailed ? <Skeleton label="Loading today" lines={3} /> : null}
    {failed ? <ErrorState message={FAILED} onRetry={retry} busy={busy} /> : null}
    {!failed && result?.kind === 'time-zone-unconfigured' ? <p>Kairos needs your time zone to show today. <TodayLink to="/settings">Open Settings</TodayLink></p> : null}
    {shown !== null && !shown.hasTrades ? <p>Your day shows here once you log a trade.</p> : null}
    {shown !== null && shown.hasTrades ? <TodayBody today={shown} priceNow={priceNow} /> : null}
    {/* D269: one place for the news, before the first trade and after, so its link keeps focus when that changes. */}
    {shown !== null ? <NewsLines news={shown.news} nowMs={Date.parse(nowRef.current())} /> : null}
  </Card>;
}
