import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalysisHistoryWorkspace, FOREX_ANALYSIS_INTERVALS } from '../src/app/AnalysisHistoryWorkspace';
import { AnalysisLiveCandleCanvas, type AnalysisLiveCandleCanvasProps } from '../src/app/AnalysisLiveCandleCanvas';
import type { AnalysisSavedTradeOverlayLiveCandleCanvasProps } from '../src/app/AnalysisSavedTradeOverlayLiveCandleCanvas';
import { projectAnalysisSavedTradeChartReference } from '../src/app/analysisSavedTradeChartReferenceProjection';
import { presentAnalysisLiveCandleStatus, type AnalysisLiveCandleStatusPresentationInput } from '../src/app/analysisLiveCandleStatusPresentation';
import { createBinanceAnalysisLiveCandleProductionLifecycle } from '../src/app/binanceAnalysisLiveCandleProductionLifecycle';
import type {
  BinanceAnalysisLiveCandleBrowserNetworkSource,
  BinanceAnalysisLiveCandleBrowserVisibilitySource,
} from '../src/app/binanceAnalysisLiveCandleBrowserAvailabilityLifecycle';
import { FOREX_ANALYSIS_REFRESH_LIMIT, FOREX_ANALYSIS_REFRESH_MS, startForexAnalysisCandleRefresh } from '../src/app/forexAnalysisCandleRefresh';
import type { AnalysisLiveCandleReactBindingResult } from '../src/app/useAnalysisLiveCandleRouteSession';
import type { JournalHistoryEntry } from '../src/application/journal';
import { ThemeProvider } from '../src/design-system/themes';
import { parseDecimalString, type DecimalString, type TradeExecutionId, type TradeId } from '../src/domain/trades';
import type { MarketCandle, MarketCandleHistoryPort, MarketCandleHistoryRequest, MarketCandleHistoryResult } from '../src/services/market-data/MarketCandleHistoryPort';

const d = (value: string) => value as DecimalString;
const instrument = { venue: 'oanda-forex', symbol: 'EURUSD' } as const;
const MINUTE = 60_000;
const T0 = Date.parse('2026-10-23T07:00:00.000Z');
const candle = (openMs: number, close = '1.0866'): MarketCandle => ({
  openTime: new Date(openMs).toISOString(), closeTime: new Date(openMs + MINUTE - 1).toISOString(), open: d('1.0851'), high: d('1.0874'), low: d('1.0842'), close: d(close),
});
const answer = (request: MarketCandleHistoryRequest, candles: readonly MarketCandle[]): MarketCandleHistoryResult =>
  ({ ok: true, snapshot: { source: 'market-reference', timeZone: 'UTC', request, observedAt: '2026-10-23T07:02:00.000Z', candles } });

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function browser() {
  const listeners = new Map<string, Set<() => void>>();
  const add = (type: string, listener: () => void) => { const current = listeners.get(type) ?? new Set(); current.add(listener); listeners.set(type, current); };
  const remove = (type: string, listener: () => void) => listeners.get(type)?.delete(listener);
  const document = { visibilityState: 'visible', addEventListener: vi.fn(add), removeEventListener: vi.fn(remove) } as unknown as BinanceAnalysisLiveCandleBrowserVisibilitySource;
  const window = { navigator: { onLine: true }, addEventListener: vi.fn(add), removeEventListener: vi.fn(remove) } as unknown as BinanceAnalysisLiveCandleBrowserNetworkSource;
  return {
    document, window,
    hidden(value: boolean) {
      (document as { visibilityState: DocumentVisibilityState }).visibilityState = value ? 'hidden' : 'visible';
      listeners.get('visibilitychange')?.forEach(listener => listener());
    },
  };
}
const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

describe('T-055c the forex Analysis chart reads again every 30 seconds (D234)', () => {
  it('reads the newest candles every 30 seconds while visible, never while hidden, and again from history when back', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const calls: MarketCandleHistoryRequest[] = [];
    const history: MarketCandleHistoryPort = {
      acquireHistory: vi.fn(async request => {
        calls.push(request);
        // History: two candles. A read from the latest: that candle moved, and the next one opened.
        return request.startTimeMs === undefined ? answer(request, [candle(T0), candle(T0 + MINUTE)]) : answer(request, [candle(T0 + MINUTE, '1.0870'), candle(T0 + 2 * MINUTE)]);
      }),
    };
    const renderer = { render: vi.fn(), updateLatestCandle: vi.fn(), destroy: vi.fn() };
    const states: string[] = [];
    const dispositions: string[] = [];
    const page = browser();
    const lifecycle = createBinanceAnalysisLiveCandleProductionLifecycle({ history, availabilitySources: page });
    await expect(lifecycle.replace({
      instrument, interval: '1m', historyLimit: 500, reconnectPolicy: { initialDelayMs: 250, maxDelayMs: 4000, maxAttempts: 5 },
      renderHistory: () => renderer, onStateChange: state => states.push(state), onDisposition: disposition => dispositions.push(disposition.kind),
    })).resolves.toMatchObject({ ok: true });
    expect(calls).toEqual([{ instrument, interval: '1m', limit: 500 }]);
    expect(states).toEqual(['live']);

    vi.advanceTimersByTime(FOREX_ANALYSIS_REFRESH_MS - 1);
    await flush();
    expect(calls).toHaveLength(1);
    vi.advanceTimersByTime(1);
    await flush();
    expect(calls[1]).toEqual({ instrument, interval: '1m', limit: FOREX_ANALYSIS_REFRESH_LIMIT, startTimeMs: T0 + MINUTE });
    expect(renderer.updateLatestCandle.mock.calls.map(([drawn]) => [drawn.openTime, drawn.close])).toEqual([['2026-10-23T07:01:00.000Z', '1.0870'], ['2026-10-23T07:02:00.000Z', '1.0866']]);
    expect(dispositions).toEqual(['rendered-current', 'rendered-next']);

    // A hidden tab never reads.
    page.hidden(true);
    vi.advanceTimersByTime(5 * FOREX_ANALYSIS_REFRESH_MS);
    await flush();
    expect(calls).toHaveLength(2);
    // Back on the page: history first, then every 30 seconds again.
    page.hidden(false);
    await flush();
    expect(calls[2]).toEqual({ instrument, interval: '1m', limit: 500 });
    vi.advanceTimersByTime(FOREX_ANALYSIS_REFRESH_MS);
    await flush();
    expect(calls[3]).toMatchObject({ startTimeMs: T0 + MINUTE });
    lifecycle.close();
    vi.advanceTimersByTime(5 * FOREX_ANALYSIS_REFRESH_MS);
    await flush();
    expect(calls).toHaveLength(4);
  });

  it('a failed read says it missed and tries again; a full page reads history again; nothing older is drawn', async () => {
    let tick: (() => void) | null = null;
    const timers = { setInterval: vi.fn((callback: () => void) => { tick = callback; return 1; }), clearInterval: vi.fn() };
    const results: MarketCandleHistoryResult[] = [
      { ok: false, reason: 'unavailable', why: 'source-down', retryAfterSeconds: null },
      answer({ instrument, interval: '1m', limit: FOREX_ANALYSIS_REFRESH_LIMIT }, [candle(T0 - MINUTE), candle(T0)]),
      answer({ instrument, interval: '1m', limit: FOREX_ANALYSIS_REFRESH_LIMIT }, Array.from({ length: FOREX_ANALYSIS_REFRESH_LIMIT }, (_, i) => candle(T0 + i * MINUTE, `1.08${i}`))),
    ];
    const history: MarketCandleHistoryPort = { acquireHistory: vi.fn(async () => results.shift()!) };
    const renderer = { render: vi.fn(), updateLatestCandle: vi.fn(), destroy: vi.fn() };
    const states: string[] = [];
    const onBackfillRequired = vi.fn();
    const started = startForexAnalysisCandleRefresh({ instrument, interval: '1m', initialCandle: candle(T0), renderer, history, onBackfillRequired, onStateChange: state => states.push(state), timers, now: () => T0 });
    expect(started.ok).toBe(true);
    tick!();
    await flush();
    expect(states).toEqual(['live', 'disconnected']);
    tick!();
    await flush();
    // The same candle and an older one change nothing.
    expect(renderer.updateLatestCandle).not.toHaveBeenCalled();
    expect(states.at(-1)).toBe('live');
    tick!();
    await flush();
    expect(renderer.updateLatestCandle).toHaveBeenCalledTimes(FOREX_ANALYSIS_REFRESH_LIMIT);
    expect(onBackfillRequired).toHaveBeenCalledWith(expect.objectContaining({ instrument, interval: '1m' }));
    if (started.ok) started.subscription.close();
    expect(timers.clearInterval).toHaveBeenCalledWith(1);
  });

  it('the status line says "Updates every 30 seconds" in plain words, and crypto keeps its own', () => {
    const input = (overrides: Partial<AnalysisLiveCandleStatusPresentationInput>): AnalysisLiveCandleStatusPresentationInput => ({
      availability: 'available', activation: { ok: true, snapshot: {} as never }, connection: 'live', disposition: null, backfillRecovery: null, lastError: null, forexPair: 'EUR/USD', ...overrides,
    });
    expect(presentAnalysisLiveCandleStatus(input({}))).toMatchObject({ kind: 'live', label: 'Updates every 30 seconds' });
    expect(presentAnalysisLiveCandleStatus(input({ connection: 'disconnected' }))).toMatchObject({ label: 'Update missed', detail: 'Kairos tries again in 30 seconds.' });
    expect(presentAnalysisLiveCandleStatus(input({ availability: 'hidden' }))).toMatchObject({ kind: 'paused-hidden', label: 'Updates paused' });
    expect(presentAnalysisLiveCandleStatus(input({ activation: { ok: false, reason: 'history-failed', failure: { ok: false, reason: 'unavailable', why: 'unknown-market', retryAfterSeconds: null } } })))
      .toMatchObject({ kind: 'unavailable', detail: "Candles: OANDA doesn't list EUR/USD." });
    expect(presentAnalysisLiveCandleStatus(input({ forexPair: null }))).toMatchObject({ kind: 'live', label: 'Live candles connected' });
  });

  it('the chart names the pair and its 30-second updates', () => {
    const binding: AnalysisLiveCandleReactBindingResult = {
      availability: 'available', activation: { ok: false, reason: 'superseded' }, connection: 'live', disposition: null, backfillRequest: null, backfillRecovery: null, lastError: null,
      pan: vi.fn(), zoom: vi.fn(), resetView: vi.fn(),
    };
    const snapshot = { source: 'market-reference' as const, timeZone: 'UTC' as const, request: { instrument, interval: '1h', limit: 500 }, observedAt: '2026-10-23T07:02:00.000Z', candles: [candle(T0)] };
    render(<ThemeProvider><AnalysisLiveCandleCanvas instrument={instrument} interval="1h" quoteAsset="USD" useBinding={() => ({ ...binding, activation: { ok: true, snapshot } })} /></ThemeProvider>);
    expect(screen.getByRole('group', { name: 'EUR/USD 1h candlestick chart' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('EUR/USD · 1h · Updates every 30 seconds');
    expect(screen.getByText(/^Read at 2026-10-23 07:02:00\.000 UTC\. OANDA's mid prices; the last candle may still be forming\.$/)).toBeInTheDocument();
  });
});

const fact = { instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' }, baseAsset: 'BTC', quoteAsset: 'USDT', tradingEnabled: true };
const LiveCanvas = (props: AnalysisLiveCandleCanvasProps) => <div data-testid="live-candle-canvas">{props.instrument.symbol}/{props.interval}</div>;
const SavedTradeLiveCanvas = (props: AnalysisSavedTradeOverlayLiveCandleCanvasProps) =>
  <div data-testid="saved-trade-canvas">{`${props.instrument.venue} ${props.instrument.symbol}/${props.interval} ${props.quoteAsset}`}</div>;
function forexEntry(symbol: string, marketType = 'forex'): JournalHistoryEntry {
  const start = new Date(Date.now() - 2 * 86_400_000).toISOString(), end = new Date(Date.now() - 2 * 86_400_000 + 3 * 3_600_000).toISOString();
  return {
    trade: { id: `trade-${symbol}` as TradeId, symbol, marketType, status: 'closed', side: 'long', openedAt: start, closedAt: end, createdAt: start, grossPnlCurrency: 'USD' },
    plans: [], fees: [],
    executions: [
      { id: 'e1' as TradeExecutionId, type: 'entry', price: '1.085', quantity: '10000', executedAt: start },
      { id: 'x1' as TradeExecutionId, type: 'exit', price: '1.09', quantity: '10000', executedAt: end },
    ],
  } as unknown as JournalHistoryEntry;
}

describe('T-055c a forex trade on the Analysis chart', () => {
  it('opens its OANDA pair with the forex timeframes, without asking for the Binance market list', async () => {
    const ports = { metadata: { acquireInstrumentMetadata: vi.fn(async () => ({ ok: false as const, reason: 'unavailable' as const, why: 'source-down' as const, retryAfterSeconds: null })) }, forexCandles: true };
    render(<AnalysisHistoryWorkspace entry={forexEntry('EUR/USD')} ports={ports} LiveCanvas={LiveCanvas} SavedTradeLiveCanvas={SavedTradeLiveCanvas} />);
    expect(await screen.findByTestId('saved-trade-canvas')).toHaveTextContent('oanda-forex EURUSD/15m USD');
    const chart = screen.getByRole('region', { name: 'Market chart' });
    expect(within(chart).getByText('OANDA · EUR/USD · mid prices')).toBeInTheDocument();
    expect(within(screen.getByRole('combobox', { name: 'Timeframe' })).getAllByRole('option').map(option => option.getAttribute('value')).filter(Boolean)).toEqual([...FOREX_ANALYSIS_INTERVALS]);
    expect(screen.queryByRole('combobox', { name: 'Chart symbol' })).toBeNull();
    expect(screen.queryByText(/Markets:/)).toBeNull();
    expect(ports.metadata.acquireInstrumentMetadata).not.toHaveBeenCalled();
  });

  it('without the Kairos server, or for a symbol that is not a pair, the trade stays in its picture', async () => {
    const ports = () => ({ metadata: { acquireInstrumentMetadata: vi.fn(async () => ({ ok: true as const, facts: [fact] })) }, forexCandles: false });
    const { unmount } = render(<AnalysisHistoryWorkspace entry={forexEntry('EURUSD')} ports={ports()} LiveCanvas={LiveCanvas} SavedTradeLiveCanvas={SavedTradeLiveCanvas} />);
    expect(await screen.findByText('Forex candles need the Kairos server. Your forex trade is drawn in its picture above, with your plan, entries and exits.')).toBeInTheDocument();
    unmount();
    render(<AnalysisHistoryWorkspace entry={forexEntry('EURUSDM')} ports={{ ...ports(), forexCandles: true }} LiveCanvas={LiveCanvas} SavedTradeLiveCanvas={SavedTradeLiveCanvas} />);
    expect(await screen.findByText('Forex candles need a six-letter pair, such as EURUSD or XAUUSD. Your forex trade is drawn in its picture above, with your plan, entries and exits.')).toBeInTheDocument();
    expect(screen.queryByTestId('saved-trade-canvas')).toBeNull();
  });

  it("its entries and exits are placed on the pair's chart (EUR/USD is EURUSD)", () => {
    const dec = (value: string) => { const parsed = parseDecimalString(value); if (!parsed.ok) throw new Error(value); return parsed.value; };
    const entry = forexEntry('EUR/USD');
    const withDecimals = { ...entry, executions: entry.executions.map(fill => ({ ...fill, price: dec(fill.price), quantity: dec(fill.quantity) })) };
    const result = projectAnalysisSavedTradeChartReference(withDecimals, { instrument, quoteAsset: 'USD' });
    expect(result).toMatchObject({ kind: 'reference-ready' });
    if (result.kind !== 'reference-ready') return;
    expect(result.facts.executedEntries.map(fill => fill.price)).toEqual(['1.085']);
    expect(result.facts.executedExits.map(fill => fill.price)).toEqual(['1.09']);
    expect(projectAnalysisSavedTradeChartReference(withDecimals, { instrument: { venue: 'binance-spot', symbol: 'EURUSD' }, quoteAsset: 'USD' })).toMatchObject({ kind: 'unavailable', reason: 'market-type-mismatch' });
    expect(projectAnalysisSavedTradeChartReference({ ...withDecimals, trade: { ...withDecimals.trade, marketType: 'stock' } }, { instrument, quoteAsset: 'USD' })).toMatchObject({ kind: 'unavailable', reason: 'stock-not-on-chart' });
  });
});
