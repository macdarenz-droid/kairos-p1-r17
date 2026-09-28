import { describe, expect, it, vi } from 'vitest';
import {
  startBinanceAnalysisLiveCandleProductionBrowserSession,
  type BinanceAnalysisLiveCandleProductionBrowserSessionStarter,
} from '../src/app/binanceAnalysisLiveCandleProductionBrowserSession';
import type { DecimalString } from '../src/domain/trades';
import type { ProjectedIncrementalCandleRendererLifecycle } from '../src/features/chart';
import type { MarketCandle } from '../src/services/market-data/MarketCandleHistoryPort';
import type { BinanceAnalysisLiveCandleSubscription } from '../src/app/binanceAnalysisLiveCandleBrowserSubscriptionComposition';

const d = (value: string) => value as DecimalString;
const instrument = { venue: 'binance-spot', symbol: 'BTCUSDT' } as const;
const initialCandle: MarketCandle = {
  openTime: '2026-09-13T01:00:00.000Z',
  closeTime: '2026-09-13T01:00:59.999Z',
  open: d('100'), high: d('105'), low: d('95'), close: d('101'),
};

function renderer(): ProjectedIncrementalCandleRendererLifecycle {
  return { render: vi.fn(), updateLatestCandle: vi.fn(), destroy: vi.fn() };
}

describe('Analysis live candle production browser session', () => {
  it('binds the released browser sources to the released session unchanged', () => {
    const receiptTimestamp = vi.fn(() => '2026-09-13T01:01:00.000Z');
    const scheduler = { schedule: vi.fn(), cancel: vi.fn() };
    const reconnectSample = vi.fn(() => 0.25);
    const runtimeSources = { receiptTimestamp, scheduler, reconnectSample };
    const reconnectPolicy = { initialDelayMs: 250, maxDelayMs: 4000, maxAttempts: 5 };
    const onBackfillRequired = vi.fn();
    const onDisposition = vi.fn();
    const onStateChange = vi.fn();
    const onError = vi.fn();
    const lifecycle = { close: vi.fn() };
    const startSession = vi.fn<BinanceAnalysisLiveCandleProductionBrowserSessionStarter>(
      options => {
        expect(options).toMatchObject({
          instrument, interval: '1m', initialCandle, reconnectPolicy,
          receiptTimestamp, scheduler, reconnectSample,
          onBackfillRequired, onDisposition, onStateChange, onError,
        });
        return { ok: true, subscription: lifecycle };
      },
    );

    const result = startBinanceAnalysisLiveCandleProductionBrowserSession({
      instrument, interval: '1m', initialCandle, renderer: renderer(), reconnectPolicy,
      onBackfillRequired, onDisposition, onStateChange, onError,
      runtimeSources, startSession,
    });

    expect(result).toEqual({ ok: true, subscription: lifecycle });
    expect(startSession).toHaveBeenCalledTimes(1);
    expect(receiptTimestamp).not.toHaveBeenCalled();
    expect(reconnectSample).not.toHaveBeenCalled();
    expect(scheduler.schedule).not.toHaveBeenCalled();
  });

  it('forwards an injected low-level subscription for deterministic composition tests', () => {
    const subscribe = vi.fn<BinanceAnalysisLiveCandleSubscription>(
      () => ({ ok: false, reason: 'venue-mismatch' }),
    );
    const startSession = vi.fn<BinanceAnalysisLiveCandleProductionBrowserSessionStarter>(
      options => {
        expect(options.subscribe).toBe(subscribe);
        return { ok: false, reason: 'venue-mismatch' };
      },
    );

    const result = startBinanceAnalysisLiveCandleProductionBrowserSession({
      instrument, interval: '1m', initialCandle, renderer: renderer(),
      reconnectPolicy: { initialDelayMs: 100, maxDelayMs: 1000, maxAttempts: 3 },
      onBackfillRequired: vi.fn(), subscribe, startSession,
      runtimeSources: {
        receiptTimestamp: vi.fn(),
        scheduler: { schedule: vi.fn(), cancel: vi.fn() },
        reconnectSample: vi.fn(),
      },
    });

    expect(result).toEqual({ ok: false, reason: 'venue-mismatch' });
    expect(startSession).toHaveBeenCalledTimes(1);
  });

  it('does not invent reconnect policy or lifecycle callbacks', () => {
    const reconnectPolicy = { initialDelayMs: 0, maxDelayMs: 0, maxAttempts: 0 };
    const onBackfillRequired = vi.fn();
    const startSession = vi.fn<BinanceAnalysisLiveCandleProductionBrowserSessionStarter>(
      options => {
        expect(options.reconnectPolicy).toBe(reconnectPolicy);
        expect(options.onBackfillRequired).toBe(onBackfillRequired);
        expect(options.onDisposition).toBeUndefined();
        expect(options.onStateChange).toBeUndefined();
        expect(options.onError).toBeUndefined();
        return { ok: false, reason: 'venue-mismatch' };
      },
    );

    expect(startBinanceAnalysisLiveCandleProductionBrowserSession({
      instrument, interval: '1m', initialCandle, renderer: renderer(),
      reconnectPolicy, onBackfillRequired, startSession,
    })).toEqual({ ok: false, reason: 'venue-mismatch' });
  });
});
