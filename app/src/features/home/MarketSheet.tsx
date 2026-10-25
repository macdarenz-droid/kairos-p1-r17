import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import {
  describeMarketMove, isMarketMovesReadingFresh, MARKET_MOVE_PERIOD_WORDS, MARKET_SHEET_REFRESH_MS, projectMarketMoveLine,
  type MarketMoveLineResult, type MarketMovePeriod, type MarketMovesReader, type MarketMovesWindow,
} from '../../application/markets/marketMoves';
import { describeMarketDataUnavailable, describeUpdatedAgo } from '../../application/online/onlineWords';
import type { DecimalString } from '../../domain/trades';
import { Sheet, UnavailableNotice } from '../../design-system/primitives';
import type { MarketDataInstrument, MarketDataUnavailable } from '../../services/market-data/marketDataTypes';
import './marketSheet.css';

/** One market as the map shows it: its live price and 24-hour move come from the map's prices, read every 5 s. */
export interface MarketSheetCoin {
  readonly instrument: MarketDataInstrument;
  /** The coin (BTC) and what it is priced in (USDT), or null when unknown. */
  readonly base: string;
  readonly quote: string | null;
  /** D255: the coin's name (Bitcoin) when Kairos is sure of it. */
  readonly name: string | null;
  /** The last price as the source wrote it, and when the source read it. */
  readonly price: DecimalString | null;
  readonly observedAt: string | null;
  /** null: not available (missing, or too old to show as now). */
  readonly move24h: DecimalString | null;
}

export interface MarketSheetProps {
  /** The market shown; null: closed. */
  readonly coin: MarketSheetCoin | null;
  /** The map's choice: which period the line draws. */
  readonly period: MarketMovePeriod;
  readonly reader: MarketMovesReader;
  /** Every market on the map: a moves read is one request for all of them, so the map can use it too. */
  readonly symbols: () => readonly string[];
  /** "Open chart": this market's address on the Analysis chart (the app makes it). */
  readonly chartHref: string;
  readonly onClose: () => void;
  /** Where focus goes when the sheet closes: the tapped bubble (a tap does not focus a button in Safari). */
  readonly returnFocusTo: () => HTMLElement | null;
}

const WINDOWS: readonly MarketMovesWindow[] = ['1h', '7d'];
const LINE_WORDS: Readonly<Record<MarketMovePeriod, string>> = Object.freeze({ '1h': 'hour', '24h': '24 hours', '7d': '7 days' });
const MOVE_SUBJECT: Readonly<Record<MarketMovesWindow, string>> = Object.freeze({ '1h': '1-hour move', '7d': '7-day move' });
const ARROWS = Object.freeze({ up: '▲', down: '▼', none: '' });
const LINE_WIDTH = 320;
const LINE_HEIGHT = 96;
const LINE_STEPS = 88;
const AGO_TICK_MS = 5_000;

/** The current time, again every `intervalMs` while `active`, so "… ago" words keep time. */
export function useNowEvery(intervalMs: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, active]);
  return now;
}

/**
 * T-061e (D271): a market's details from Home's bubble map, in the design system's Sheet: its name, the price now and
 * how old it is, the moves over 1 hour, 24 hours and 7 days, a small line of the price over the map's period, and
 * "Open chart". The numbers come from their owners (application/markets/marketMoves.ts, the map's prices); the sheet
 * only shows them. Closing gives the focus back to the bubble that opened it.
 */
export function MarketSheet({ coin, period, reader, symbols, chartHref, onClose, returnFocusTo }: MarketSheetProps) {
  const open = coin !== null;
  const wasOpen = useRef(false);
  const returnTo = useRef(returnFocusTo);
  returnTo.current = returnFocusTo;
  // After the Sheet gives the focus back to what had it (nothing, after a tap in Safari), the bubble takes it.
  useEffect(() => {
    if (open) { wasOpen.current = true; return; }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    returnTo.current()?.focus();
  }, [open]);
  const title = coin === null ? '' : coin.name === null ? coin.base : `${coin.base} · ${coin.name}`;
  return <Sheet open={open} title={title} onClose={onClose}>
    {coin === null ? null : <MarketSheetBody key={`${coin.instrument.venue}:${coin.instrument.symbol}`} coin={coin} period={period} reader={reader} symbols={symbols} chartHref={chartHref} />}
  </Sheet>;
}

type LineState = Readonly<{ result: MarketMoveLineResult | null; reading: boolean }>;

/** The sheet's reads: on open, a candle page and this coin's two moves (the map's when fresh); again every 60 s while open and shown. */
function useSheetReads(reader: MarketMovesReader, instrument: MarketDataInstrument, period: MarketMovePeriod, symbols: () => readonly string[]) {
  const [line, setLine] = useState<LineState>({ result: null, reading: true });
  const retry = useRef<(() => void) | null>(null);
  const asked = useRef(symbols);
  asked.current = symbols;
  const { venue, symbol } = instrument;
  useEffect(() => {
    const controller = new AbortController();
    const market = Object.freeze({ venue, symbol });
    const markets = () => [...new Set([...asked.current(), symbol])];
    let lineFailed = false;
    const readLine = (byTrader: boolean) => {
      setLine(current => ({ result: current.result, reading: true }));
      void reader.readLine(market, period, { byTrader, signal: controller.signal }).then(result => {
        if (controller.signal.aborted) return;
        lineFailed = !result.ok;
        setLine({ result, reading: false });
      });
    };
    const readAll = () => {
      readLine(false);
      for (const window of WINDOWS) void reader.ensure(window, markets(), { signal: controller.signal });
    };
    let missed = false;
    readAll();
    const timer = setInterval(() => { if (document.hidden) missed = true; else readAll(); }, MARKET_SHEET_REFRESH_MS);
    const shown = () => { if (!document.hidden && missed) { missed = false; readAll(); } };
    document.addEventListener('visibilitychange', shown);
    // "Try again" asks again for what failed, even while the source asked to wait.
    retry.current = () => {
      if (lineFailed) readLine(true);
      for (const window of WINDOWS) if (reader.state()[window].failure !== null) void reader.ensure(window, markets(), { byTrader: true, signal: controller.signal });
    };
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', shown);
      retry.current = null;
    };
  }, [reader, venue, symbol, period]);
  return { line, retry: () => retry.current?.() };
}

function MoveItem({ period, percent, state }: { readonly period: MarketMovePeriod; readonly percent: DecimalString | null; readonly state: 'shown' | 'loading' | 'failed' }) {
  const words = state === 'shown' ? describeMarketMove(percent) : null;
  let value: ReactNode;
  if (state === 'loading') value = <span className="kairos-market-sheet__value">…<span className="kairos-visually-hidden">loading</span></span>;
  else if (words === null) value = <span className="kairos-market-sheet__value">not available</span>;
  else value = <span className="kairos-market-sheet__value"><span aria-hidden="true">{words.direction === 'none' ? words.size : `${ARROWS[words.direction]} ${words.size}`}</span><span className="kairos-visually-hidden">{words.direction === 'none' ? 'no change' : `${words.direction} ${words.size}`}</span></span>;
  return <li data-direction={words?.direction ?? 'unknown'}><span className="kairos-market-sheet__period">{MARKET_MOVE_PERIOD_WORDS[period]}</span> {value}</li>;
}

function PriceLine({ result, period }: { readonly result: MarketMoveLineResult | null; readonly period: MarketMovePeriod }) {
  if (result === null || !result.ok) return null;
  const points = projectMarketMoveLine(result.closes, LINE_STEPS);
  if (points === null) return <p className="kairos-market-sheet__note">{`No prices in the last ${LINE_WORDS[period]}.`}</p>;
  const first = result.closes[0]!, last = result.closes[result.closes.length - 1]!;
  const direction = points[points.length - 1]! > points[0]! ? 'up' : points[points.length - 1]! < points[0]! ? 'down' : 'none';
  const top = (LINE_HEIGHT - LINE_STEPS) / 2;
  const at = (index: number) => (points.length === 1 ? LINE_WIDTH / 2 : (index * LINE_WIDTH) / (points.length - 1));
  return <svg className="kairos-market-sheet__line" data-direction={direction} role="img" aria-label={`Price over the last ${LINE_WORDS[period]}, from ${first} to ${last}`}
    viewBox={`0 0 ${LINE_WIDTH} ${LINE_HEIGHT}`} preserveAspectRatio="none" focusable="false">
    <polyline points={points.map((step, index) => `${at(index)},${top + LINE_STEPS - step}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
  </svg>;
}

function MarketSheetBody({ coin, period, reader, symbols, chartHref }: Omit<MarketSheetProps, 'coin' | 'onClose' | 'returnFocusTo'> & { readonly coin: MarketSheetCoin }) {
  const moves = useSyncExternalStore(reader.subscribe, reader.state, reader.state);
  const { line, retry } = useSheetReads(reader, coin.instrument, period, symbols);
  const now = useNowEvery(AGO_TICK_MS);
  const inRouter = useInRouterContext();
  const notice = useRef<HTMLDivElement>(null);
  const chart = useRef<HTMLAnchorElement>(null);
  /** Set by "Try again" from inside the notice: when the answer takes the notice away, "Open chart" takes the focus. */
  const retried = useRef(false);

  const observedMs = coin.observedAt === null ? Number.NaN : Date.parse(coin.observedAt);
  const ago = describeUpdatedAgo(now - observedMs);
  const moveState = (window: MarketMovesWindow) => {
    const { reading, failure } = moves[window];
    if (failure !== null) return { state: 'failed' as const, percent: null };
    // No reading yet, or one too old to say the move now (or without this market): the sheet's read is on its way.
    if (reading === null || !isMarketMovesReadingFresh(reading, now, [coin.instrument.symbol])) return { state: 'loading' as const, percent: null };
    return { state: 'shown' as const, percent: reading.moves.get(coin.instrument.symbol) ?? null };
  };
  const hour = moveState('1h'), week = moveState('7d');
  // What failed, in its owner's words: the line first, else the first move that failed.
  const failedWindow = WINDOWS.find(window => moves[window].failure !== null) ?? null;
  const failure: Readonly<{ unavailable: MarketDataUnavailable; subject: string }> | null = line.result !== null && !line.result.ok
    ? { unavailable: line.result, subject: 'Price line' }
    : failedWindow === null ? null : { unavailable: moves[failedWindow].failure!.unavailable, subject: MOVE_SUBJECT[failedWindow] };
  const words = failure === null ? null : describeMarketDataUnavailable(failure.unavailable, failure.subject);
  const busy = line.reading || (failedWindow !== null && moves[failedWindow].pending);

  useLayoutEffect(() => {
    if (!retried.current || notice.current !== null) return;
    retried.current = false;
    const active = document.activeElement;
    if (active === null || active === document.body) chart.current?.focus();
  });

  const linkClass = 'kairos-button kairos-button--secondary kairos-button--md kairos-market-sheet__open';
  return <div className="kairos-market-sheet">
    <div>
      <p className="kairos-market-sheet__price">{coin.price === null ? 'Price not available' : `Price ${coin.price}${coin.quote === null ? '' : ` ${coin.quote}`}`}</p>
      {ago === null ? null : <p className="kairos-market-sheet__ago">{`Updated ${ago}`}</p>}
    </div>
    <ul className="kairos-market-sheet__moves" aria-label="Moves">
      <MoveItem period="1h" percent={hour.percent} state={hour.state} />
      <MoveItem period="24h" percent={coin.move24h} state="shown" />
      <MoveItem period="7d" percent={week.percent} state={week.state} />
    </ul>
    {line.result === null ? <p className="kairos-market-sheet__note" role="status">Loading the price line…</p> : <PriceLine result={line.result} period={period} />}
    {words === null ? null : <div ref={notice} onClickCapture={() => { retried.current = notice.current?.contains(document.activeElement) ?? false; }}>
      <UnavailableNotice message={words.message} retryLabel={words.retryLabel} onRetry={retry} busy={busy} retryWhenOnline={words.retryWhenOnline} />
    </div>}
    {inRouter ? <Link ref={chart} to={chartHref} className={linkClass}>Open chart</Link> : <a ref={chart} href={chartHref} className={linkClass}>Open chart</a>}
    {coin.name === null ? null : <p className="kairos-market-sheet__credit">Coin names: CoinGecko</p>}
  </div>;
}
