/**
 * T-061e (D271): the one owner of a market's move over 1 hour and 7 days, and of when Home reads those moves and the
 * market sheet's line.
 *
 * Request budget (review r1, recounted from the code). The Kairos server allows 30 requests a minute for a device that
 * is not activated (120 when it is), counted before its cache. Home at most, in any 60 seconds, through the server:
 * | part                  | most | why                                                                                        |
 * |-----------------------|------|--------------------------------------------------------------------------------------------|
 * | live prices           | 12   | one read every 5 s; a return to Home reads at once, but within 5 s of the last read the     |
 * |                       |      | browser answers from its copy (the server's answer is fresh 5 s), so reads stay 5 s apart   |
 * | price now (Today)     | 6    | at most 3 markets, once a minute; a futures trade with no futures candles reads twice (its |
 * |                       |      | spot market after); a return within 60 s reuses the answer (TodayCard, review r1)            |
 * | market list           | 1    | the first visit only (kept on the device 6 h)                                               |
 * | coin names            | 1    | once a visit: an answer is kept a day, a failure for the visit or its wait (marketApi.ts)    |
 * | shared reads          | 9    | the news refresh (9 at once, at most once in 30 min) and these market reads (1 each), all    |
 * |                       |      | through one budget of HOME_SHARED_READS_PER_MINUTE (application/online/requestBudget.ts)     |
 * | total                 | 29   |                                                                                            |
 * Minute by minute:
 * | minute                                   | live prices | price now | list + names | shared                         | total |
 * |------------------------------------------|-------------|-----------|--------------|--------------------------------|-------|
 * | 1st (news due), with a return to Home    | 12          | 6 (3)     | 2            | 9: the news; these reads wait  | ≤ 29  |
 * | 2nd to 30th, with or without a return    | 12          | 6 (3)     | 0            | ≤ 9 (2–3 in use, see below)    | ≤ 27  |
 * | 31st (news due again)                    | 12          | 6 (3)     | 0 (1 + 1 after 6 h / a day) | 9                | ≤ 29  |
 * (3): with spot trades. A read past the budget waits its turn; it is never refused or repeated, and a big ask (the
 * news) is never passed by small ones. In normal use these market reads need less:
 * - "1 hour" chosen and seen: one read every 30 s (2 a minute); "7 days": one every 5 minutes; "24 hours": none (that
 *   move comes with the live prices);
 * - the sheet open (the map's reads stop under it): its line once a minute, the 1-hour moves once a minute (older than
 *   30 s at each refresh), the 7-day moves once every 5 minutes: 2 or 3 a minute; the map's moves while fresh are used.
 * A busy or rate-limited answer waits the time the source asked (60 s for the server's limit) before the cadence asks
 * again; only the trader's "Try again" asks sooner, and it goes through the same budget. Without the Kairos server
 * (no VITE_KAIROS_API_URL) the market reads go straight to Binance: no Kairos limit, so no budget (null).
 */
import { calculatePercentage } from '../../domain/calculations/percentageCalculator';
import { decimalAbs, decimalCompare, decimalRound, decimalScaleToSteps, decimalSubtract } from '../../domain/calculations/decimalKernel';
import type { DecimalString } from '../../domain/trades';
import type { MarketCandleHistoryPort, MarketCandleHistoryResult } from '../../services/market-data/MarketCandleHistoryPort';
import type { MarketMovesPort, MarketMovesWindow } from '../../services/market-data/MarketMovesPort';
import type { MarketDataInstrument, MarketDataUnavailable } from '../../services/market-data/marketDataTypes';
import type { RequestBudget } from '../online/requestBudget';

export type { MarketMovesWindow } from '../../services/market-data/MarketMovesPort';

/** What Home's market bubbles are sized by. */
export type MarketMovePeriod = '1h' | '24h' | '7d';
export const MARKET_MOVE_PERIODS: readonly MarketMovePeriod[] = Object.freeze(['1h', '24h', '7d']);
export const MARKET_MOVE_PERIOD_WORDS: Readonly<Record<MarketMovePeriod, string>> = Object.freeze({ '1h': '1 hour', '24h': '24 hours', '7d': '7 days' });

/** How often each window is read while it is chosen and seen; also how long a reading counts as fresh. */
export const MARKET_MOVES_REFRESH_MS: Readonly<Record<MarketMovesWindow, number>> = Object.freeze({ '1h': 30_000, '7d': 300_000 });
/** The open sheet reads its line (and its coin's moves, when not fresh) again this often. */
export const MARKET_SHEET_REFRESH_MS = 60_000;

/** The sheet's line: the closes of the period, from one candle page (1m × 60, 15m × 96, 1h × 168). */
export const MARKET_MOVE_LINE_CANDLES: Readonly<Record<MarketMovePeriod, Readonly<{ interval: string; limit: number }>>> = Object.freeze({
  '1h': Object.freeze({ interval: '1m', limit: 60 }),
  '24h': Object.freeze({ interval: '15m', limit: 96 }),
  '7d': Object.freeze({ interval: '1h', limit: 168 }),
});

/** The move in percent: (last − open) ÷ open × 100, exact; null when it cannot be known (no opening price, bad text). */
export function projectMarketMove(open: DecimalString, last: DecimalString): DecimalString | null {
  const change = decimalSubtract(last, open);
  if (!change.ok) return null;
  const percent = calculatePercentage(change.value, open);
  return percent.ok ? percent.value : null;
}

export type MarketMoveWords = Readonly<{ direction: 'up' | 'down' | 'none'; size: string }>;

/** A move in plain words: "up" and "2.3%" (one decimal place, half up); a move too small to show is "less than 0.1%". */
export function describeMarketMove(percent: DecimalString | null): MarketMoveWords | null {
  if (percent === null) return null;
  const sign = decimalCompare(percent, '0');
  const size = decimalAbs(percent);
  if (sign === null || !size.ok) return null;
  if (sign === 0) return Object.freeze({ direction: 'none', size: '0%' });
  const rounded = decimalRound(size.value, 1, 'half-up');
  if (!rounded.ok) return null;
  return Object.freeze({ direction: sign > 0 ? 'up' : 'down', size: rounded.value === '0' ? 'less than 0.1%' : `${rounded.value}%` });
}

/** For drawing only: each close's height in steps from the lowest close (0) to the highest (steps); flat in the middle. */
export function projectMarketMoveLine(closes: readonly DecimalString[], steps: number): readonly number[] | null {
  if (closes.length === 0) return null;
  let low = closes[0]!, high = closes[0]!;
  for (const close of closes) {
    const belowLow = decimalCompare(close, low), aboveHigh = decimalCompare(close, high);
    if (belowLow === null || aboveHigh === null) return null;
    if (belowLow < 0) low = close;
    if (aboveHigh > 0) high = close;
  }
  const range = decimalSubtract(high, low);
  if (!range.ok) return null;
  if (decimalCompare(range.value, '0') === 0) return Object.freeze(closes.map(() => Math.round(steps / 2)));
  const points: number[] = [];
  for (const close of closes) {
    const above = decimalSubtract(close, low);
    const step = above.ok ? decimalScaleToSteps(above.value, range.value, steps) : null;
    if (step === null) return null;
    points.push(step);
  }
  return Object.freeze(points);
}

/** One answer for a window: each market's move by symbol (null: unknown), the source's read time and when it came. */
export interface MarketMovesReading {
  readonly window: MarketMovesWindow;
  readonly observedAt: string;
  readonly readAtMs: number;
  readonly moves: ReadonlyMap<string, DecimalString | null>;
}

/**
 * Whether a reading still says the move now: younger than its window's refresh time, and (when markets are named)
 * holding each of them. A market new to the map is not in an older reading.
 */
export function isMarketMovesReadingFresh(reading: MarketMovesReading | null, nowMs: number, symbols: readonly string[] = []): boolean {
  // A reading newer than the clock asked (a screen's clock ticks every few seconds) is as fresh as it gets.
  if (reading === null) return false;
  return nowMs - reading.readAtMs < MARKET_MOVES_REFRESH_MS[reading.window] && symbols.every(symbol => reading.moves.has(symbol));
}

export interface MarketMovesFailure {
  readonly unavailable: MarketDataUnavailable;
  readonly atMs: number;
  /** Until when the source asked to wait (0: no wait). */
  readonly busyUntilMs: number;
}

/** A window's last good reading, whether a read is on its way, and the last read's failure (cleared by a good one). */
export interface MarketMovesWindowState {
  readonly reading: MarketMovesReading | null;
  readonly pending: boolean;
  readonly failure: MarketMovesFailure | null;
}
export type MarketMovesState = Readonly<Record<MarketMovesWindow, MarketMovesWindowState>>;

/** The sheet's line: the closes of the period as the source wrote them, oldest first. */
export type MarketMoveLineResult = Readonly<{ ok: true; period: MarketMovePeriod; closes: readonly DecimalString[]; observedAt: string }> | MarketDataUnavailable;

export interface MarketMovesCadence {
  /** What the map sizes by, and whether it can be seen (the page shown, no sheet over it, markets to ask for). */
  update(next: Readonly<{ period: MarketMovePeriod; visible: boolean }>): void;
  close(): void;
}

export interface MarketMovesReader {
  state(): MarketMovesState;
  subscribe(listener: () => void): () => void;
  /** The map's cadence: a window is read when chosen and seen, at once when not fresh, then once each refresh time. */
  cadence(symbols: () => readonly string[]): MarketMovesCadence;
  /**
   * One read of a window for these markets unless its reading is fresh or the source asked to wait; `byTrader`
   * ("Try again") reads anyway. A read already on its way is shared.
   */
  ensure(window: MarketMovesWindow, symbols: readonly string[], options?: Readonly<{ byTrader?: boolean; signal?: AbortSignal }>): Promise<void>;
  /** One candle page for the sheet's line, through the same gate; while the source asks to wait, only "Try again" reads. */
  readLine(instrument: MarketDataInstrument, period: MarketMovePeriod, options?: Readonly<{ byTrader?: boolean; signal?: AbortSignal }>): Promise<MarketMoveLineResult>;
}

export interface MarketMovesReaderOptions {
  readonly moves: MarketMovesPort;
  readonly history: MarketCandleHistoryPort;
  /** Home's shared request budget on the Kairos server (the count above); null: none (straight to Binance). */
  readonly budget: RequestBudget | null;
  readonly now?: () => number;
}

const unavailable = (why: MarketDataUnavailable['why'], retryAfterSeconds: number | null = null): MarketDataUnavailable =>
  Object.freeze({ ok: false as const, reason: 'unavailable' as const, why, retryAfterSeconds });
const ascending = (symbols: readonly string[]): readonly string[] => [...new Set(symbols)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const EMPTY: MarketMovesWindowState = Object.freeze({ reading: null, pending: false, failure: null });

/** A history answer that is not a page, said as market data words. */
function lineFailure(result: Exclude<MarketCandleHistoryResult, { ok: true }>, online: boolean): MarketDataUnavailable {
  if (result.reason === 'unavailable') return result;
  if (result.reason === 'http-error') return result.status === 429 || result.status === 418 ? unavailable('busy') : result.status === 451 || result.status === 403 ? unavailable('region') : unavailable('source-down');
  if (result.reason === 'invalid-response' || result.reason === 'observed-at-invalid' || result.reason === 'invalid-request') return unavailable('unreadable');
  return unavailable(online ? 'source-down' : 'offline');
}

export function createMarketMovesReader({ moves: port, history, budget, now = () => Date.now() }: MarketMovesReaderOptions): MarketMovesReader {
  const isOnline = () => globalThis.navigator?.onLine !== false;
  /** One request through Home's budget (none without the server); a read abandoned before it left gives it back. */
  const gate = {
    take: (signal: AbortSignal | undefined): Promise<boolean> => (budget === null ? Promise.resolve(!(signal?.aborted ?? false)) : budget.take(1, signal)),
    refund: (): void => budget?.refund(1),
  };
  const listeners = new Set<() => void>();
  let state: MarketMovesState = Object.freeze({ '1h': EMPTY, '7d': EMPTY });
  /** The read on its way for each window: shared by every caller, stopped only when all of them have left. */
  const running = new Map<MarketMovesWindow, { readonly promise: Promise<void>; readonly controller: AbortController; waiters: number }>();
  let lineBusyUntilMs = 0;
  let lineBusy: MarketDataUnavailable | null = null;

  const set = (window: MarketMovesWindow, next: Partial<MarketMovesWindowState>) => {
    state = Object.freeze({ ...state, [window]: Object.freeze({ ...state[window], ...next }) });
    for (const listener of [...listeners]) listener();
  };
  const fresh = (window: MarketMovesWindow, symbols: readonly string[]) => isMarketMovesReadingFresh(state[window].reading, now(), symbols);
  const waitingUntil = (window: MarketMovesWindow) => state[window].failure?.busyUntilMs ?? 0;

  function start(window: MarketMovesWindow, symbols: readonly string[]) {
    const controller = new AbortController();
    const entry = { controller, waiters: 0, promise: Promise.resolve() };
    entry.promise = (async () => {
      set(window, { pending: true });
      try {
        if (!(await gate.take(controller.signal))) return;
        if (controller.signal.aborted) { gate.refund(); return; }
        const result = await port.acquireMoves({ symbols: ascending(symbols), window }, { signal: controller.signal });
        if (controller.signal.aborted) return;
        const atMs = now();
        if (!result.ok) {
          set(window, { failure: Object.freeze({ unavailable: result, atMs, busyUntilMs: result.retryAfterSeconds === null ? 0 : atMs + result.retryAfterSeconds * 1000 }) });
          return;
        }
        const byMarket = new Map<string, DecimalString | null>();
        for (const move of result.moves) byMarket.set(move.symbol, projectMarketMove(move.open, move.last));
        set(window, { failure: null, reading: Object.freeze({ window, observedAt: result.observedAt, readAtMs: atMs, moves: byMarket }) });
      } catch {
        if (!controller.signal.aborted) set(window, { failure: Object.freeze({ unavailable: unavailable(isOnline() ? 'source-down' : 'offline'), atMs: now(), busyUntilMs: 0 }) });
      } finally {
        if (running.get(window) === entry) running.delete(window);
        // A read dropped by every caller may end after a newer one started: that one is still on its way.
        set(window, { pending: running.has(window) });
      }
    })();
    running.set(window, entry);
    return entry;
  }

  /** A caller's wait for the shared read; its abort ends only its own wait, and the read stops when nobody waits. */
  function join(window: MarketMovesWindow, symbols: readonly string[], signal: AbortSignal | undefined): Promise<void> {
    const entry = running.get(window) ?? start(window, symbols);
    entry.waiters += 1;
    return new Promise<void>((resolve) => {
      let left = false;
      const leave = () => {
        if (left) return;
        left = true;
        entry.waiters -= 1;
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      const onAbort = () => { leave(); if (entry.waiters === 0) { if (running.get(window) === entry) running.delete(window); entry.controller.abort(); } };
      signal?.addEventListener('abort', onAbort, { once: true });
      void entry.promise.then(leave);
    });
  }

  const reader: MarketMovesReader = {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async ensure(window, symbols, options = {}) {
      if (options.signal?.aborted || symbols.length === 0) return;
      if (!options.byTrader && (fresh(window, symbols) || waitingUntil(window) > now())) return;
      await join(window, symbols, options.signal);
    },
    async readLine(instrument, period, options = {}) {
      const signal = options.signal;
      const stopped = () => unavailable(isOnline() ? 'source-down' : 'offline');
      if (signal?.aborted) return stopped();
      if (!options.byTrader && lineBusy !== null && lineBusyUntilMs > now()) return lineBusy;
      if (!(await gate.take(signal))) return stopped();
      if (signal?.aborted) { gate.refund(); return stopped(); }
      const { interval, limit } = MARKET_MOVE_LINE_CANDLES[period];
      let result: MarketCandleHistoryResult;
      try {
        result = await history.acquireHistory({ instrument, interval, limit }, signal === undefined ? undefined : { signal });
      } catch {
        return stopped();
      }
      if (signal?.aborted) return stopped();
      if (!result.ok) {
        const failure = lineFailure(result, isOnline());
        if (failure.retryAfterSeconds !== null) { lineBusy = failure; lineBusyUntilMs = now() + failure.retryAfterSeconds * 1000; }
        return failure;
      }
      lineBusy = null;
      return Object.freeze({ ok: true as const, period, closes: Object.freeze(result.snapshot.candles.map(candle => candle.close)), observedAt: result.snapshot.observedAt });
    },
    cadence(symbols) {
      let chosen: MarketMovePeriod = '24h';
      let shown = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let controller: AbortController | null = null;
      let closed = false;
      const stop = () => {
        if (timer !== null) { clearTimeout(timer); timer = null; }
        controller?.abort();
        controller = null;
      };
      /** The next read: at once when the window is not fresh, else when it stops being fresh; never before a wait asked by the source. */
      const plan = (window: MarketMovesWindow, afterRead: boolean) => {
        if (closed || timer !== null) return;
        const at = now();
        const reading = state[window].reading;
        // Chosen or shown again: a reading that is old or lacks a market now on the map is read at once (through the
        // budget); between reads, a market new to the map waits for the next one (the map draws it "not available").
        let due = afterRead ? at + MARKET_MOVES_REFRESH_MS[window] : reading !== null && fresh(window, symbols()) ? reading.readAtMs + MARKET_MOVES_REFRESH_MS[window] : at;
        due = Math.max(due, waitingUntil(window));
        const read = () => {
          timer = null;
          // Another read (the sheet's, "Try again") made it fresh meanwhile: wait for it to age instead.
          if (fresh(window, symbols())) { plan(window, false); return; }
          const mine = new AbortController();
          controller = mine;
          void join(window, symbols(), mine.signal).then(() => {
            if (controller !== mine || mine.signal.aborted) return;
            controller = null;
            plan(window, true);
          });
        };
        if (due <= at) read();
        else timer = setTimeout(read, due - at);
      };
      return {
        update(next) {
          if (closed) return;
          const active = next.period !== '24h' && next.visible;
          const changed = next.period !== chosen || active !== shown;
          chosen = next.period;
          shown = active;
          if (!changed) return;
          stop();
          if (active) plan(chosen as MarketMovesWindow, false);
        },
        close() {
          closed = true;
          stop();
        },
      };
    },
  };
  return Object.freeze(reader);
}
