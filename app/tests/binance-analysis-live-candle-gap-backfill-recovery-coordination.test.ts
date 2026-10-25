import { describe, expect, it, vi } from 'vitest';
import {
  createBinanceAnalysisLiveCandleGapBackfillRecoveryCoordinator,
  type BinanceAnalysisLiveCandleGapBackfillRecoveryOptions,
} from '../src/app/binanceAnalysisLiveCandleGapBackfillRecoveryCoordination';
import type {
  BinanceAnalysisHistoryLiveCandleBootstrapCoordinator,
  BinanceAnalysisHistoryLiveCandleBootstrapOptions,
  BinanceAnalysisHistoryLiveCandleBootstrapResult,
} from '../src/app/binanceAnalysisHistoryLiveCandleBootstrapCoordination';
import type { BinanceAnalysisCandleBackfillRequest } from '../src/app/binanceAnalysisLiveCandleProjectionRendererCoordination';
import type { DecimalString } from '../src/domain/trades';
import type { MarketCandleHistorySnapshot } from '../src/services/market-data/MarketCandleHistoryPort';

const d = (value: string) => value as DecimalString;
const instrument = { venue: 'binance-spot', symbol: 'BTCUSDT' } as const;
const candle = { openTime: '2026-09-13T05:00:00.000Z', closeTime: '2026-09-13T05:00:59.999Z', open: d('100'), high: d('101'), low: d('99'), close: d('100.5') };
const snapshot: MarketCandleHistorySnapshot = { source: 'market-reference', timeZone: 'UTC', request: { instrument, interval: '1m', limit: 500 }, observedAt: '2026-09-13T05:01:00.000Z', candles: [candle] };
const ok: BinanceAnalysisHistoryLiveCandleBootstrapResult = { ok: true, snapshot };

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

function request(overrides: Partial<BinanceAnalysisCandleBackfillRequest> = {}): BinanceAnalysisCandleBackfillRequest {
  return {
    instrument,
    interval: '1m',
    observation: { instrument, price: d('105'), observedAt: '2026-09-13T05:05:00.000Z', sourceTimestamp: '2026-09-13T05:05:00.000Z' },
    ...overrides,
  };
}

function controlled(results: BinanceAnalysisHistoryLiveCandleBootstrapResult[] = [ok]): {
  readonly bootstrap: BinanceAnalysisHistoryLiveCandleBootstrapCoordinator;
  readonly calls: BinanceAnalysisHistoryLiveCandleBootstrapOptions[];
} {
  const calls: BinanceAnalysisHistoryLiveCandleBootstrapOptions[] = [];
  const bootstrap: BinanceAnalysisHistoryLiveCandleBootstrapCoordinator = {
    replace: vi.fn(async received => {
      calls.push(received);
      return results.shift() ?? ok;
    }),
    stop: vi.fn(),
    isPending: vi.fn(() => false),
    isLive: vi.fn(() => true),
  };
  return { bootstrap, calls };
}

describe('Analysis live candle gap backfill recovery coordination', () => {
  it('reacquires and rerenders one exact-scope gap through the released bootstrap', async () => {
    const lower = controlled([ok, ok]);
    const onBackfillRequired = vi.fn();
    const onBackfillRecovery = vi.fn();
    const coordinator = createBinanceAnalysisLiveCandleGapBackfillRecoveryCoordinator(lower.bootstrap);
    await expect(coordinator.replace(options({ onBackfillRequired, onBackfillRecovery }))).resolves.toEqual(ok);

    lower.calls[0].onBackfillRequired(request());
    await vi.waitFor(() => expect(lower.calls).toHaveLength(2));
    expect(onBackfillRequired).toHaveBeenCalledWith(request());
    expect(lower.calls[1].instrument).toEqual(instrument);
    expect(lower.calls[1].interval).toBe('1m');
    expect(lower.calls[1].historyLimit).toBe(500);
    await vi.waitFor(() => expect(onBackfillRecovery).toHaveBeenCalledWith(ok));
    expect(coordinator.isRecovering()).toBe(false);
  });

  it('coalesces duplicate gap demand while one authoritative recovery is pending', async () => {
    let resolve!: (result: BinanceAnalysisHistoryLiveCandleBootstrapResult) => void;
    const lower = controlled([ok]);
    vi.mocked(lower.bootstrap.replace).mockImplementationOnce(async received => { lower.calls.push(received); return ok; })
      .mockImplementationOnce(received => { lower.calls.push(received); return new Promise(done => { resolve = done; }); });
    const coordinator = createBinanceAnalysisLiveCandleGapBackfillRecoveryCoordinator(lower.bootstrap);
    await coordinator.replace(options());
    lower.calls[0].onBackfillRequired(request());
    lower.calls[0].onBackfillRequired(request());
    expect(lower.calls).toHaveLength(2);
    expect(coordinator.isRecovering()).toBe(true);
    resolve(ok);
    await vi.waitFor(() => expect(coordinator.isRecovering()).toBe(false));
  });

  it('rejects mismatched gap scope without stopping or acquiring another page', async () => {
    const lower = controlled();
    const onBackfillRecovery = vi.fn();
    const coordinator = createBinanceAnalysisLiveCandleGapBackfillRecoveryCoordinator(lower.bootstrap);
    await coordinator.replace(options({ onBackfillRecovery }));
    lower.calls[0].onBackfillRequired(request({ instrument: { venue: 'binance-spot', symbol: 'ETHUSDT' } }));
    expect(lower.calls).toHaveLength(1);
    expect(onBackfillRecovery).toHaveBeenCalledWith({ ok: false, reason: 'backfill-scope-mismatch' });
    expect(coordinator.isLive()).toBe(true);
  });

  it('suppresses recovery completion after selection replacement', async () => {
    let resolve!: (result: BinanceAnalysisHistoryLiveCandleBootstrapResult) => void;
    const lower = controlled([ok, ok]);
    vi.mocked(lower.bootstrap.replace)
      .mockImplementationOnce(async received => { lower.calls.push(received); return ok; })
      .mockImplementationOnce(received => { lower.calls.push(received); return new Promise(done => { resolve = done; }); })
      .mockImplementationOnce(async received => { lower.calls.push(received); return ok; });
    const oldRecovery = vi.fn();
    const coordinator = createBinanceAnalysisLiveCandleGapBackfillRecoveryCoordinator(lower.bootstrap);
    await coordinator.replace(options({ onBackfillRecovery: oldRecovery }));
    lower.calls[0].onBackfillRequired(request());
    await coordinator.replace(options({ instrument: { venue: 'binance-spot', symbol: 'ETHUSDT' } }));
    resolve(ok);
    await Promise.resolve();
    expect(oldRecovery).not.toHaveBeenCalled();
    expect(coordinator.isRecovering()).toBe(false);
  });

  it('reports failed authoritative recovery and leaves no live claim', async () => {
    const failure: BinanceAnalysisHistoryLiveCandleBootstrapResult = { ok: false, reason: 'history-empty' };
    const lower = controlled([ok, failure]);
    const onBackfillRecovery = vi.fn();
    const coordinator = createBinanceAnalysisLiveCandleGapBackfillRecoveryCoordinator(lower.bootstrap);
    await coordinator.replace(options({ onBackfillRecovery }));
    lower.calls[0].onBackfillRequired(request());
    await vi.waitFor(() => expect(onBackfillRecovery).toHaveBeenCalledWith(failure));
    expect(coordinator.isLive()).toBe(false);
  });

  it('stops the released bootstrap and suppresses late recovery completion', async () => {
    let resolve!: (result: BinanceAnalysisHistoryLiveCandleBootstrapResult) => void;
    const lower = controlled([ok]);
    vi.mocked(lower.bootstrap.replace).mockImplementationOnce(async received => { lower.calls.push(received); return ok; })
      .mockImplementationOnce(received => { lower.calls.push(received); return new Promise(done => { resolve = done; }); });
    const onBackfillRecovery = vi.fn();
    const coordinator = createBinanceAnalysisLiveCandleGapBackfillRecoveryCoordinator(lower.bootstrap);
    await coordinator.replace(options({ onBackfillRecovery }));
    lower.calls[0].onBackfillRequired(request());
    coordinator.stop();
    resolve(ok);
    await Promise.resolve();
    expect(lower.bootstrap.stop).toHaveBeenCalledTimes(1);
    expect(onBackfillRecovery).not.toHaveBeenCalled();
    expect(coordinator.isLive()).toBe(false);
  });
});
