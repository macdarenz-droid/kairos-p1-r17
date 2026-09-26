import { describe, expect, it, vi } from 'vitest';
import {
  createBinanceAnalysisHistoryLiveCandleBootstrapCoordinator,
  type BinanceAnalysisHistoryLiveCandleBootstrapOptions,
} from '../src/app/binanceAnalysisHistoryLiveCandleBootstrapCoordination';
import type { BinanceAnalysisSelectedLiveCandleSessionController } from '../src/app/binanceAnalysisSelectedLiveCandleSessionController';
import type { DecimalString } from '../src/domain/trades';
import type { MarketCandleHistoryPort, MarketCandleHistoryResult } from '../src/services/market-data/MarketCandleHistoryPort';

const d = (value: string) => value as DecimalString;
const instrument = { venue: 'binance-spot', symbol: 'BTCUSDT' } as const;
const candles = [
  { openTime: '2026-09-13T03:00:00.000Z', closeTime: '2026-09-13T03:00:59.999Z', open: d('100'), high: d('101'), low: d('99'), close: d('100.5') },
  { openTime: '2026-09-13T03:01:00.000Z', closeTime: '2026-09-13T03:01:59.999Z', open: d('100.5'), high: d('102'), low: d('100'), close: d('101.5') },
] as const;

function success(overrides: Partial<Extract<MarketCandleHistoryResult, { ok: true }>['snapshot']> = {}): MarketCandleHistoryResult {
  return { ok: true, snapshot: { source: 'market-reference', timeZone: 'UTC', request: { instrument, interval: '1m', limit: 500 }, observedAt: '2026-09-13T03:02:00.000Z', candles, ...overrides } };
}

function options(overrides: Partial<BinanceAnalysisHistoryLiveCandleBootstrapOptions> = {}): BinanceAnalysisHistoryLiveCandleBootstrapOptions {
  return {
    instrument,
    interval: '1m',
    historyLimit: 500,
    reconnectPolicy: { initialDelayMs: 250, maxDelayMs: 4000, maxAttempts: 5 },
    renderHistory: vi.fn(() => ({ render: vi.fn(), updateLatestCandle: vi.fn(), destroy: vi.fn() })),
    onBackfillRequired: vi.fn(),
    ...overrides,
  };
}

function sessions(): BinanceAnalysisSelectedLiveCandleSessionController {
  const replace: BinanceAnalysisSelectedLiveCandleSessionController['replace'] = vi.fn(
    () => ({ ok: true as const, subscription: { close: vi.fn() } }),
  );
  return { replace, stop: vi.fn(), isActive: vi.fn(() => true) };
}

describe('Analysis history to selected live candle bootstrap coordination', () => {
  it('acquires the exact recent scope, renders history and starts live from the final candle', async () => {
    const order: string[] = [];
    const history: MarketCandleHistoryPort = { acquireHistory: vi.fn(async (request, acquisition) => {
      order.push('history');
      expect(request).toEqual({ instrument, interval: '1m', limit: 500 });
      expect(acquisition?.signal).toBeInstanceOf(AbortSignal);
      return success();
    }) };
    const controlled = sessions();
    vi.mocked(controlled.stop).mockImplementation(() => { order.push('stop-old'); });
    const renderHistory = vi.fn(snapshot => {
      order.push('render-history'); expect(snapshot.candles).toEqual(candles);
      return { render: vi.fn(), updateLatestCandle: vi.fn(), destroy: vi.fn() };
    });
    vi.mocked(controlled.replace).mockImplementation(received => {
      order.push('start-live'); expect(received.initialCandle).toEqual(candles[1]); expect(received.instrument).toEqual(instrument);
      return { ok: true, subscription: { close: vi.fn() } };
    });
    const coordinator = createBinanceAnalysisHistoryLiveCandleBootstrapCoordinator(history, controlled);

    await expect(coordinator.replace(options({ renderHistory }))).resolves.toMatchObject({ ok: true });
    expect(order).toEqual(['stop-old', 'history', 'render-history', 'start-live']);
    expect(coordinator.isPending()).toBe(false);
    expect(coordinator.isLive()).toBe(true);
  });

  it('aborts and suppresses an older history result when selection changes', async () => {
    let resolveFirst!: (value: MarketCandleHistoryResult) => void;
    let firstSignal: AbortSignal | undefined;
    const history: MarketCandleHistoryPort = { acquireHistory: vi.fn((_, acquisition) => {
      if (!firstSignal) { firstSignal = acquisition?.signal; return new Promise<MarketCandleHistoryResult>(resolve => { resolveFirst = resolve; }); }
      return Promise.resolve(success({ request: { instrument: { venue: 'binance-spot', symbol: 'ETHUSDT' }, interval: '5m', limit: 200 } }));
    }) };
    const controlled = sessions();
    const coordinator = createBinanceAnalysisHistoryLiveCandleBootstrapCoordinator(history, controlled);
    const first = coordinator.replace(options());
    const second = coordinator.replace(options({ instrument: { venue: 'binance-spot', symbol: 'ETHUSDT' }, interval: '5m', historyLimit: 200 }));
    expect(firstSignal?.aborted).toBe(true);
    resolveFirst(success());

    await expect(first).resolves.toEqual({ ok: false, reason: 'superseded' });
    await expect(second).resolves.toMatchObject({ ok: true });
    expect(controlled.replace).toHaveBeenCalledTimes(1);
  });

  it('rejects a mismatched history scope before rendering or starting live', async () => {
    const history: MarketCandleHistoryPort = { acquireHistory: vi.fn(async () => success({ request: { instrument: { venue: 'binance-spot', symbol: 'ETHUSDT' }, interval: '1m', limit: 500 } })) };
    const controlled = sessions(); const supplied = options();
    const result = await createBinanceAnalysisHistoryLiveCandleBootstrapCoordinator(history, controlled).replace(supplied);
    expect(result).toEqual({ ok: false, reason: 'history-scope-mismatch' });
    expect(supplied.renderHistory).not.toHaveBeenCalled(); expect(controlled.replace).not.toHaveBeenCalled();
  });

  it('keeps empty or failed history unavailable instead of inventing a live anchor', async () => {
    const controlled = sessions();
    const empty: MarketCandleHistoryPort = { acquireHistory: vi.fn(async () => success({ candles: [] })) };
    await expect(createBinanceAnalysisHistoryLiveCandleBootstrapCoordinator(empty, controlled).replace(options())).resolves.toEqual({ ok: false, reason: 'history-empty' });
    const failed: MarketCandleHistoryPort = { acquireHistory: vi.fn(async () => ({ ok: false as const, reason: 'http-error' as const, status: 429, retryAfter: '5' })) };
    await expect(createBinanceAnalysisHistoryLiveCandleBootstrapCoordinator(failed, controlled).replace(options())).resolves.toEqual({ ok: false, reason: 'history-failed', failure: { ok: false, reason: 'http-error', status: 429, retryAfter: '5' } });
    expect(controlled.replace).not.toHaveBeenCalled();
  });

  it('stops pending acquisition and active live ownership idempotently', async () => {
    let signal: AbortSignal | undefined; let resolve!: (value: MarketCandleHistoryResult) => void;
    const history: MarketCandleHistoryPort = { acquireHistory: vi.fn((_, acquisition) => { signal = acquisition?.signal; return new Promise<MarketCandleHistoryResult>(done => { resolve = done; }); }) };
    const controlled = sessions(); const coordinator = createBinanceAnalysisHistoryLiveCandleBootstrapCoordinator(history, controlled);
    const pending = coordinator.replace(options()); coordinator.stop(); coordinator.stop();
    expect(signal?.aborted).toBe(true); expect(coordinator.isPending()).toBe(false); expect(controlled.stop).toHaveBeenCalledTimes(3);
    resolve(success()); await expect(pending).resolves.toEqual({ ok: false, reason: 'superseded' });
  });
});
