import { describe, expect, it, vi } from 'vitest';
import {
  createBinanceAnalysisLiveCandleProductionLifecycle,
} from '../src/app/binanceAnalysisLiveCandleProductionLifecycle';
import type {
  BinanceAnalysisLiveCandleBrowserNetworkSource,
  BinanceAnalysisLiveCandleBrowserVisibilitySource,
} from '../src/app/binanceAnalysisLiveCandleBrowserAvailabilityLifecycle';
import type { BinanceAnalysisLiveCandleGapBackfillRecoveryOptions } from '../src/app/binanceAnalysisLiveCandleGapBackfillRecoveryCoordination';
import type { BinanceAnalysisSelectedLiveCandleSessionStarter } from '../src/app/binanceAnalysisSelectedLiveCandleSessionController';
import type { DecimalString } from '../src/domain/trades';
import type { MarketCandleHistoryPort, MarketCandleHistoryResult } from '../src/services/market-data/MarketCandleHistoryPort';

const d = (value: string) => value as DecimalString;
const instrument = { venue: 'binance-spot', symbol: 'BTCUSDT' } as const;
const candles = [
  { openTime: '2026-09-13T07:00:00.000Z', closeTime: '2026-09-13T07:00:59.999Z', open: d('100'), high: d('101'), low: d('99'), close: d('100.5') },
  { openTime: '2026-09-13T07:01:00.000Z', closeTime: '2026-09-13T07:01:59.999Z', open: d('100.5'), high: d('102'), low: d('100'), close: d('101.5') },
] as const;

function historySuccess(): MarketCandleHistoryResult {
  return { ok: true, snapshot: { source: 'market-reference', timeZone: 'UTC', request: { instrument, interval: '1m', limit: 500 }, observedAt: '2026-09-13T07:02:00.000Z', candles } };
}

function options(overrides: Partial<BinanceAnalysisLiveCandleGapBackfillRecoveryOptions> = {}): BinanceAnalysisLiveCandleGapBackfillRecoveryOptions {
  return {
    instrument,
    interval: '1m',
    historyLimit: 500,
    reconnectPolicy: { initialDelayMs: 250, maxDelayMs: 4000, maxAttempts: 5 },
    renderHistory: vi.fn(() => ({ render: vi.fn(), updateLatestCandle: vi.fn(), destroy: vi.fn() })),
    ...overrides,
  };
}

function browser() {
  const listeners = new Map<string, Set<() => void>>();
  const add = (type: string, listener: () => void) => {
    const current = listeners.get(type) ?? new Set(); current.add(listener); listeners.set(type, current);
  };
  const remove = (type: string, listener: () => void) => listeners.get(type)?.delete(listener);
  const document = { visibilityState: 'visible', addEventListener: vi.fn(add), removeEventListener: vi.fn(remove) } as unknown as BinanceAnalysisLiveCandleBrowserVisibilitySource;
  const window = { navigator: { onLine: true }, addEventListener: vi.fn(add), removeEventListener: vi.fn(remove) } as unknown as BinanceAnalysisLiveCandleBrowserNetworkSource;
  return {
    document,
    window,
    hidden(value: boolean) {
      (document as { visibilityState: DocumentVisibilityState }).visibilityState = value ? 'hidden' : 'visible';
      listeners.get('visibilitychange')?.forEach(listener => listener());
    },
  };
}

function controlled() {
  const history: MarketCandleHistoryPort = { acquireHistory: vi.fn(async () => historySuccess()) };
  const starts: Array<Parameters<BinanceAnalysisSelectedLiveCandleSessionStarter>[0]> = [];
  const subscriptions: Array<{ close: ReturnType<typeof vi.fn> }> = [];
  const startSession = vi.fn<BinanceAnalysisSelectedLiveCandleSessionStarter>(received => {
    starts.push(received);
    const subscription = { close: vi.fn() };
    subscriptions.push(subscription);
    return { ok: true, subscription };
  });
  return { history, starts, subscriptions, startSession };
}

describe('Analysis live candle production lifecycle composition', () => {
  it('uses authoritative history then starts the released live session from its final candle', async () => {
    const lower = controlled();
    const lifecycle = createBinanceAnalysisLiveCandleProductionLifecycle({ history: lower.history, startSession: lower.startSession, availabilitySources: browser() });

    await expect(lifecycle.replace(options())).resolves.toMatchObject({ ok: true });

    expect(lower.history.acquireHistory).toHaveBeenCalledWith({ instrument, interval: '1m', limit: 500 }, { signal: expect.any(AbortSignal) });
    expect(lower.starts).toHaveLength(1);
    expect(lower.starts[0].initialCandle).toEqual(candles[1]);
    expect(lifecycle.isActive()).toBe(true);
  });

  it('forwards caller-owned policy, renderer and state callbacks without inventing defaults', async () => {
    const lower = controlled();
    const onStateChange = vi.fn();
    const onError = vi.fn();
    const reconnectPolicy = { initialDelayMs: 111, maxDelayMs: 2222, maxAttempts: 3 };
    const renderHistory = vi.fn(() => ({ render: vi.fn(), updateLatestCandle: vi.fn(), destroy: vi.fn() }));
    const lifecycle = createBinanceAnalysisLiveCandleProductionLifecycle({ history: lower.history, startSession: lower.startSession, availabilitySources: browser() });

    await lifecycle.replace(options({ reconnectPolicy, renderHistory, onStateChange, onError }));

    expect(lower.starts[0].reconnectPolicy).toBe(reconnectPolicy);
    expect(lower.starts[0].renderer).toBe(vi.mocked(renderHistory).mock.results[0].value);
    lower.starts[0].onStateChange?.('live');
    const failure = new Error('stream-failed');
    lower.starts[0].onError?.(failure);
    expect(onStateChange).toHaveBeenCalledWith('live');
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it('stops live ownership while hidden and reacquires authoritative history before resume', async () => {
    const lower = controlled();
    const source = browser();
    const lifecycle = createBinanceAnalysisLiveCandleProductionLifecycle({ history: lower.history, startSession: lower.startSession, availabilitySources: source });
    await lifecycle.replace(options());

    source.hidden(true);
    expect(lower.subscriptions[0].close).toHaveBeenCalledTimes(1);
    expect(lifecycle.isActive()).toBe(false);
    source.hidden(false);

    await vi.waitFor(() => expect(lower.history.acquireHistory).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(lower.starts).toHaveLength(2));
    expect(lower.starts[1].initialCandle).toEqual(candles[1]);
    await vi.waitFor(() => expect(lifecycle.isActive()).toBe(true));
  });

  it('routes a candle gap through authoritative history recovery and coalesces duplicates', async () => {
    const lower = controlled();
    let finishRecovery!: (result: MarketCandleHistoryResult) => void;
    vi.mocked(lower.history.acquireHistory)
      .mockResolvedValueOnce(historySuccess())
      .mockImplementationOnce(() => new Promise(resolve => { finishRecovery = resolve; }));
    const onBackfillRequired = vi.fn();
    const onBackfillRecovery = vi.fn();
    const lifecycle = createBinanceAnalysisLiveCandleProductionLifecycle({ history: lower.history, startSession: lower.startSession, availabilitySources: browser() });
    await lifecycle.replace(options({ onBackfillRequired, onBackfillRecovery }));
    const gap = { instrument, interval: '1m', observation: { instrument, price: d('103'), observedAt: '2026-09-13T07:04:01.000Z', sourceTimestamp: '2026-09-13T07:04:00.000Z' } } as const;

    lower.starts[0].onBackfillRequired(gap);
    lower.starts[0].onBackfillRequired(gap);
    expect(lower.history.acquireHistory).toHaveBeenCalledTimes(2);
    expect(onBackfillRequired).toHaveBeenCalledTimes(1);
    finishRecovery(historySuccess());
    await vi.waitFor(() => expect(onBackfillRecovery).toHaveBeenCalledWith(expect.objectContaining({ ok: true })));
  });

  it('closes the assembled lifecycle and removes browser listeners idempotently', async () => {
    const lower = controlled();
    const source = browser();
    const lifecycle = createBinanceAnalysisLiveCandleProductionLifecycle({ history: lower.history, startSession: lower.startSession, availabilitySources: source });
    await lifecycle.replace(options());
    lifecycle.close(); lifecycle.close();
    expect(lower.subscriptions[0].close).toHaveBeenCalledTimes(1);
    expect(source.document.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(source.window.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function));
    expect(source.window.removeEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
  });
});
