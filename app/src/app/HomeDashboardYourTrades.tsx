import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type AnchorHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { JOURNAL_CHANGED_EVENT } from './AppShell';
import { HOME_YOUR_TRADES_PERIODS, loadHomeYourTrades, type HomeYourTrade, type HomeYourTradesChoice, type HomeYourTradesResult } from '../application/dashboard/homeDashboardYourTradesQuery';
import { projectYourTradeBubbleSizes } from '../application/dashboard/homeDashboardYourTradesSizing';
import { signedText } from '../application/performance/tradeRisk';
import { describeVisualPnlCompactAmount, startVisualPnlTimeZoneFromDevice, writeVisualPnlPeriodChoice } from '../application/visual-pnl';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import { GlassDecoration, glassFieldBottom } from './HomeDashboardGlassBubbleMap';
import { appHomeMarket } from './marketDataPorts';
import type { CoinLogoKeeper } from '../application/markets/coinLogos';
import type { CoinLogoAddress } from '../domain/market/coinLogo';
import { CoinIcon, marketCoin } from '../features/home/CoinIcon';
import { layoutGlassViewportCircles } from './homeDashboardGlassViewportLayout';
import { useHomeDashboardGlassMotion } from './useHomeDashboardGlassMotion';
import { Button, EmptyState, ErrorState, Segmented, Skeleton } from '../design-system/primitives';
import { tradePageHref } from '../features/journal/tradeAddress';
import { readDeviceTimeZone } from '../features/settings/DeviceTimeZoneButton';
import { LOG_TRADE_ADDRESS } from '../features/setup/GettingStartedCard';
import './homeDashboardYourTrades.css';

type PeriodKind = HomeYourTradesChoice['kind'];
export interface HomeDashboardYourTradesProps {
  readonly db?: KairosDatabase;
  /** The current instant (UTC ISO); a stable function, so a render never reads again. */
  readonly now?: () => string;
  /** The period shown. Home keeps it in the address (D270); without it the view keeps its own, from "Month". */
  readonly choice?: HomeYourTradesChoice;
  readonly onChoiceChange?: (choice: HomeYourTradesChoice) => void;
  readonly glance?: ReactNode;
  /** Tests inject a loader. */
  readonly load?: typeof loadHomeYourTrades;
  /** T-061f (D272): the coin logos this device keeps (Home's own unless given; null: none). */
  readonly logos?: CoinLogoKeeper | null;
}

const wallClock = (): string => new Date().toISOString();
const MONTH: HomeYourTradesChoice = Object.freeze({ kind: 'month', at: null });
const FAILED = 'Kairos could not load your saved trades. They are still on this device.';
const PERIOD_WORDS: Readonly<Record<PeriodKind, string>> = Object.freeze({ week: 'Week', month: 'Month', 'three-months': '3 months', year: 'Year', all: 'All time' });
const PERIOD_OPTIONS = HOME_YOUR_TRADES_PERIODS.map(value => Object.freeze({ value, label: PERIOD_WORDS[value] }));
const NONE_CLOSED: Readonly<Record<PeriodKind, string>> = Object.freeze({
  week: 'No trades closed this week.', month: 'No trades closed this month.', 'three-months': 'No trades closed in the last 3 months.', year: 'No trades closed this year.', all: 'No trades closed yet.',
});
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const choiceOf = (kind: PeriodKind): HomeYourTradesChoice => kind === 'all' ? Object.freeze({ kind }) : Object.freeze({ kind, at: null });
const tradesWord = (count: number): string => `${count} ${count === 1 ? 'trade' : 'trades'}`;

/** SPA navigation inside the app, a plain link outside a router (Home renders outside one in some tests). */
function RouteLink({ to, children, ...attributes }: { readonly to: string; readonly children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return useInRouterContext() ? <Link to={to} {...attributes}>{children}</Link> : <a href={to} {...attributes}>{children}</a>;
}

/**
 * T-061f (D272): the logos kept on this device for these trades' coins. Never a request: the Live Market asks for
 * logos (one request a visit), Your Trades shows what is kept.
 */
function useKeptLogos(keeper: CoinLogoKeeper | null, coins: readonly string[]): ReadonlyMap<string, CoinLogoAddress> | null {
  const [logos, setLogos] = useState<ReadonlyMap<string, CoinLogoAddress> | null>(null);
  const key = [...new Set(coins)].sort().join(',');
  useEffect(() => {
    if (keeper === null || key === '') return;
    let active = true;
    keeper.kept(key.split(',')).then(found => { if (active) setLogos(found); }, () => undefined);
    return () => { active = false; };
  }, [keeper, key]);
  return logos;
}

/** "20 Sep"; another year than today's adds it: "31 Dec 2025". */
function closeDayWords(dayKey: string, todayKey: string): string {
  const [year, month, day] = dayKey.split('-');
  const words = `${day.replace(/^0/, '')} ${MONTHS[Number.parseInt(month, 10) - 1]}`;
  return year === todayKey.slice(0, 4) ? words : `${words} ${year}`;
}

/** "result after fees +150 USDT", "+150 USD (+120 EUR)" when converted, ", not compared" off the scale; or "result not available". */
function resultWords(trade: HomeYourTrade): string {
  if (trade.amount === null || trade.outcome === 'unavailable') return 'result not available';
  const recorded = `result after fees ${signedText(trade.amount)}${trade.currency ? ` ${trade.currency}` : ''}`;
  if (trade.compared.kind === 'compared' && trade.compared.converted) return `${recorded} (${signedText(trade.compared.amount)} ${trade.compared.currency})`;
  return trade.compared.kind === 'not-compared' ? `${recorded}, not compared` : recorded;
}

/** The bubble's one name, which holds every word it shows: "BTCUSDT long, closed 20 Sep, result after fees +150 USDT". */
function bubbleName(trade: HomeYourTrade, todayKey: string): string {
  return [`${trade.symbol} ${trade.side}`, trade.closeDayKey === null ? 'closed' : `closed ${closeDayWords(trade.closeDayKey, todayKey)}`, resultWords(trade)].join(', ');
}

/** Inside the bubble: the compared amount, short ("+1.2K EUR"); off the scale, the recorded one; or "Not available". */
function bubbleAmount(trade: HomeYourTrade): string {
  const shown = trade.compared.kind === 'compared' ? trade.compared
    : trade.amount !== null && trade.outcome !== 'unavailable' ? { amount: trade.amount, currency: trade.currency } : null;
  if (shown === null) return 'Not available';
  const short = describeVisualPnlCompactAmount(shown.amount) ?? signedText(shown.amount);
  return shown.currency ? `${short} ${shown.currency}` : short;
}

/** What shows: the answer for the period asked (none yet: loading), and whether the last read failed. */
type Shown = Readonly<{ key: string; answer: HomeYourTradesResult | null; failed: boolean }>;
type Ready = Extract<HomeYourTradesResult, { kind: 'ready' }>;

/**
 * U16 (D270): Home's "Your Trades": one glass bubble per real trade closed in the chosen period, sized by its result
 * after fees (`projectYourTradeBubbleSizes`), each a link to the trade's page. The numbers come from their owners; this
 * view only shows them. It reads again when the period changes, when another tab saves and when you come back to the
 * app; with no saved time zone it saves this device's first (D199). T-061f (D272): a coin's real logo when this device
 * keeps one.
 */
export function HomeDashboardYourTrades({ db = kairosDatabase, now = wallClock, choice: chosen, onChoiceChange, glance, load = loadHomeYourTrades, logos: givenLogos }: HomeDashboardYourTradesProps) {
  const [ownChoice, setOwnChoice] = useState<HomeYourTradesChoice>(MONTH);
  const choice = chosen ?? ownChoice;
  const changeChoice = onChoiceChange ?? setOwnChoice;
  const key = choice.kind;
  const [shown, setShown] = useState<Shown>({ key, answer: null, failed: false });
  const [busy, setBusy] = useState(true);
  const [revision, setRevision] = useState(0);
  const section = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null), periods = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null), [bounds, setBounds] = useState({ width: 0, height: 320 }), [hidden, setHidden] = useState(false);
  const nowRef = useRef(now);
  nowRef.current = now;
  const request = useRef(0);
  /** Set by "Try again": a read that fails again gives its "Try again" the focus. */
  const retried = useRef(false);
  /** The last part of this view that had focus; when a new answer takes it away, the heading takes focus (never the page). */
  const lastFocus = useRef<HTMLElement | null>(null);
  const refresh = useCallback(() => setRevision(current => current + 1), []);

  useEffect(() => {
    const mine = ++request.current;
    setBusy(true);
    const read = async (): Promise<HomeYourTradesResult> => {
      const options = { choice, now: nowRef.current() };
      const answer = await load(db, options);
      if (answer.kind !== 'time-zone-unconfigured') return answer;
      // D199: on first use this device's zone is saved, then the trades are read with it.
      const started = await startVisualPnlTimeZoneFromDevice(db, readDeviceTimeZone(), options.now);
      return started.kind === 'unconfigured' ? answer : load(db, { choice, now: nowRef.current() });
    };
    const settle = (answer: HomeYourTradesResult | null): void => {
      if (mine !== request.current) return;
      setShown({ key, answer, failed: answer === null || answer.kind === 'unavailable' });
      setBusy(false);
    };
    read().then(settle, () => settle(null));
    // `choice` is read through `key`: a new object for the same period never reads again.
  }, [db, load, key, revision]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { request.current += 1; }, []);

  useEffect(() => {
    const visible = () => { setHidden(document.hidden); if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', visible); window.addEventListener('focus', refresh);
    window.addEventListener(JOURNAL_CHANGED_EVENT, refresh); // D229: and when another tab saves.
    return () => { document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', refresh); window.removeEventListener(JOURNAL_CHANGED_EVENT, refresh); };
  }, [refresh]);

  useEffect(() => {
    const box = section.current;
    if (box === null) return;
    const track = (event: FocusEvent) => { if (event.target instanceof HTMLElement) lastFocus.current = event.target; };
    // Focus moved to nothing on purpose (the element is still there): nothing to give back.
    const left = (event: FocusEvent) => {
      const target = event.target;
      if (event.relatedTarget !== null && !box.contains(event.relatedTarget as Node)) lastFocus.current = null;
      else if (event.relatedTarget === null) queueMicrotask(() => { if (target instanceof HTMLElement && target.isConnected && lastFocus.current === target) lastFocus.current = null; });
    };
    box.addEventListener('focusin', track); box.addEventListener('focusout', left);
    return () => { box.removeEventListener('focusin', track); box.removeEventListener('focusout', left); };
  }, []);
  useLayoutEffect(() => {
    const last = lastFocus.current;
    const active = document.activeElement;
    if (last !== null && !last.isConnected && (active === null || active === document.body)) heading.current?.focus();
  });
  useEffect(() => {
    if (busy || !retried.current) return;
    retried.current = false;
    if (shown.failed) section.current?.querySelector<HTMLElement>('.kairos-error-state button')?.focus();
  }, [busy, shown]);
  // "Try again" goes away while the trades load: the heading holds the focus meanwhile (focus never falls to the page).
  const retry = () => { heading.current?.focus(); retried.current = true; refresh(); };

  useEffect(() => {
    const el = field.current; if (!el) return;
    const measure = () => {
      const next = { width: el.clientWidth, height: Math.max(240, glassFieldBottom(el) - el.getBoundingClientRect().top - 12) };
      setBounds(old => old.width === next.width && old.height === next.height ? old : next);
    };
    measure(); const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure); observer?.observe(el);
    const main = el.closest('main'); if (main !== null) observer?.observe(main);
    window.addEventListener('resize', measure); window.visualViewport?.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); };
  }, []);

  const current = shown.key === key ? shown : null;
  // A period's first read, and a read after a failure, show "Loading"; a read again on return keeps the bubbles meanwhile.
  const loading = current === null || (current.answer === null && !current.failed) || (current.failed && busy);
  const ready: Ready | null = !loading && !current.failed && current.answer?.kind === 'ready' ? current.answer : null;
  const trades = useMemo(() => ready?.trades ?? [], [ready]);
  const sizes = useMemo(() => projectYourTradeBubbleSizes(trades), [trades]);
  const geometryKey = JSON.stringify(sizes.bubbles.map(({ key: bubble, radius }) => ({ key: bubble, radius })));
  const layout = useMemo(() => layoutGlassViewportCircles(JSON.parse(geometryKey), bounds.width, bounds.height), [geometryKey, bounds]);
  useHomeDashboardGlassMotion(field, layout.circles, bounds.width, layout.height, hidden || ready === null);
  const positions = new Map(layout.circles.map(circle => [circle.key, circle]));
  const byId = new Map(trades.map(trade => [trade.id as string, trade]));
  const logos = useKeptLogos(givenLogos === undefined ? appHomeMarket().logos ?? null : givenLogos, sizes.bubbles.map(size => marketCoin(byId.get(size.key)?.symbol ?? '')).filter(coin => coin !== ''));

  const seeAllTime = () => {
    changeChoice(choiceOf('all'));
    // The empty note goes away with the answer: the switch's "All time" holds the focus.
    periods.current?.querySelectorAll<HTMLElement>('button')[HOME_YOUR_TRADES_PERIODS.indexOf('all')]?.focus();
  };

  let content: ReactNode;
  if (loading) content = <Skeleton label="Loading your saved trades…" />;
  else if (current.failed || current.answer === null) content = <ErrorState message={FAILED} onRetry={retry} />;
  else if (current.answer.kind === 'time-zone-unconfigured') content = <p className="kairos-your-trades__note">Kairos needs your time zone to show your trades. <RouteLink to="/settings">Open Settings</RouteLink></p>;
  else if (ready !== null && !ready.hasTrades) content = <EmptyState icon="bubbles" headingLevel={3} title="Your trading story starts here" message="Log a trade in your journal to see it here."
    action={<RouteLink to="/journal" className="kairos-button kairos-button--primary kairos-button--md">Log your first trade</RouteLink>} />;
  else if (ready !== null && ready.trades.length === 0) content = <div className="kairos-your-trades__empty">
    <p>{NONE_CLOSED[key]}</p>
    <p className="kairos-your-trades__actions">{key === 'all' ? null : <Button variant="secondary" size="sm" onClick={seeAllTime}>See all time</Button>}<RouteLink to={LOG_TRADE_ADDRESS}>Log a trade</RouteLink></p>
  </div>;
  else if (ready !== null) content = sizes.bubbles.map((size, index) => {
    const trade = byId.get(size.key), circle = positions.get(size.key);
    if (trade === undefined || circle === undefined) return null;
    const base = marketCoin(trade.symbol);
    const movement = trade.outcome === 'profit' ? 'positive' : trade.outcome === 'loss' ? 'negative' : 'neutral';
    const style = { left: circle.x - circle.radius, top: circle.y - circle.radius, width: circle.radius * 2, height: circle.radius * 2, '--glass-label-size': `${Math.min(17, Math.max(11, circle.radius * .23))}px`, '--glass-icon-size': `${Math.min(34, Math.max(14, circle.radius * .45))}px`, '--glass-duration': '12s', '--glass-delay': `${-index * .8}s` } as CSSProperties;
    // A native link drag would cancel the bubble's own drag (homeDashboardGlassDrag), which blocks the click that ends it.
    return <RouteLink key={trade.id} to={tradePageHref(trade.id)} aria-label={bubbleName(trade, ready.todayKey)} className="kairos-glass-bubble kairos-your-trades__bubble" style={style} draggable={false}
      data-glass-key={trade.id} data-movement={movement} data-compared={size.basis === 'no-result' ? undefined : String(size.basis === 'compared')} data-identity={base === 'BTC' || base === 'ETH' ? base : undefined}>
      <span className="kairos-glass-core" aria-hidden="true" /><span className="kairos-glass-smoke" aria-hidden="true" /><GlassDecoration />
      <span className="kairos-glass-label" aria-hidden="true"><CoinIcon coin={base} logo={logos?.get(base) ?? null} className="kairos-glass-icon" /><strong>{trade.symbol}</strong><span className="kairos-glass-movement">{bubbleAmount(trade)}</span></span>
    </RouteLink>;
  });

  const { missingRate, unknownCurrency } = sizes.notCompared;
  return <section ref={section} className="kairos-your-trades kairos-glass-map" aria-label="Your Trades" aria-busy={busy || undefined} data-motion={hidden ? 'paused' : 'running'}>
    <div className="kairos-your-trades__heading"><h2 ref={heading} tabIndex={-1}>Your Trades</h2><RouteLink to="/journal">Log trade</RouteLink></div>
    {glance}
    <div ref={periods} className="kairos-your-trades__periods">
      <span aria-hidden="true">Trades closed in</span>
      <Segmented label="Trades closed in" options={PERIOD_OPTIONS} value={key} onChange={kind => changeChoice(choiceOf(kind))} />
    </div>
    {ready !== null && ready.trades.length > 0 ? <>
      <p className="kairos-your-trades__caption">One bubble per closed trade · bigger result, bigger bubble · green won, red lost</p>
      {missingRate > 0 ? <p className="kairos-your-trades__note">{`${tradesWord(missingRate)} couldn't be compared: a rate is missing.`} <RouteLink to="/currency">Add the missing rates</RouteLink></p> : null}
      {unknownCurrency > 0 ? <p className="kairos-your-trades__note">{unknownCurrency === 1 ? "1 trade couldn't be compared: it has no currency Kairos knows." : `${unknownCurrency} trades couldn't be compared: they have no currency Kairos knows.`}</p> : null}
      {ready.homeCurrency === null && sizes.currencies > 1 ? <p className="kairos-your-trades__note">Sizes compare trades in the same currency. <RouteLink to="/currency">Choose a home currency</RouteLink></p> : null}
      {sizes.total > sizes.bubbles.length ? <p className="kairos-your-trades__note">{`The ${sizes.bubbles.length} biggest of ${sizes.total} trades`} <RouteLink to={`/analysis?${writeVisualPnlPeriodChoice(choice, new URLSearchParams()).toString()}`}>See them all in your results</RouteLink></p> : null}
    </> : null}
    <div ref={field} className="kairos-glass-field kairos-your-trades__field" style={{ height: layout.height || bounds.height }}>{content}</div>
  </section>;
}
