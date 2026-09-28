import { describe, expect, it, vi } from 'vitest';
import {
  subscribeBinanceAnalysisLiveCandleBrowserSession,
  type BinanceAnalysisLiveCandleSubscription,
} from '../src/app/binanceAnalysisLiveCandleBrowserSubscriptionComposition';
import type { DecimalString } from '../src/domain/trades';
import type { ProjectedIncrementalCandleRendererLifecycle } from '../src/features/chart';
import type { MarketCandle } from '../src/services/market-data/MarketCandleHistoryPort';
import type { MarketDataSubscriptionHandlers } from '../src/services/market-data/marketDataTypes';

const d = (value: string) => value as DecimalString;
const instrument = { venue: 'binance-spot', symbol: 'BTCUSDT' } as const;
const initialCandle: MarketCandle = {
  openTime: '2026-09-13T07:00:00.000Z',
  closeTime: '2026-09-13T07:00:59.999Z',
  open: d('100'), high: d('105'), low: d('95'), close: d('101'),
};
const observation = (sourceTimestamp: string | null, price = '103', symbol = 'BTCUSDT') => ({
  instrument: { venue: 'binance-spot', symbol },
  price: d(price),
  observedAt: '2026-09-13T07:01:10.000Z',
  sourceTimestamp,
} as const);

function renderer(updateLatestCandle = vi.fn()): ProjectedIncrementalCandleRendererLifecycle {
  return { render: vi.fn(), updateLatestCandle, destroy: vi.fn() };
}

function harness() {
  let handlers: MarketDataSubscriptionHandlers | undefined;
  const close = vi.fn();
  const receiptTimestamp = () => '2026-09-13T07:01:10.000Z';
  const scheduler = { schedule: vi.fn(), cancel: vi.fn() };
  const reconnectPolicy = { initialDelayMs: 100, maxDelayMs: 1000, maxAttempts: 4 };
  const reconnectSample = () => 0.5;
  const subscribe = vi.fn<BinanceAnalysisLiveCandleSubscription>((
    receivedInstrument,
    receivedHandlers,
    receivedReceiptTimestamp,
    receivedScheduler,
    receivedPolicy,
    receivedReconnectSample,
  ) => {
    expect(receivedInstrument).toBe(instrument);
    expect(receivedReceiptTimestamp).toBe(receiptTimestamp);
    expect(receivedScheduler).toBe(scheduler);
    expect(receivedPolicy).toBe(reconnectPolicy);
    expect(receivedReconnectSample).toBe(reconnectSample);
    handlers = receivedHandlers;
    return { ok: true, subscription: { close } };
  });

  return { subscribe, getHandlers: () => handlers, close, receiptTimestamp, scheduler, reconnectPolicy, reconnectSample };
}

describe('Analysis live candle browser subscription composition', () => {
  it('forwards exact subscription configuration and renders validated current observations', () => {
    const h = harness();
    const updateLatestCandle = vi.fn();
    const onDisposition = vi.fn();
    const result = subscribeBinanceAnalysisLiveCandleBrowserSession({
      instrument, interval: '1m', initialCandle, renderer: renderer(updateLatestCandle),
      receiptTimestamp: h.receiptTimestamp, scheduler: h.scheduler,
      reconnectPolicy: h.reconnectPolicy, reconnectSample: h.reconnectSample,
      onBackfillRequired: vi.fn(), onDisposition, subscribe: h.subscribe,
    });

    h.getHandlers()?.onPrice(observation('2026-09-13T07:00:30.000Z', '110'));
    expect(updateLatestCandle).toHaveBeenCalledWith({ ...initialCandle, high: '110', close: '110' });
    expect(onDisposition).toHaveBeenCalledWith({
      kind: 'rendered-current', candle: { ...initialCandle, high: '110', close: '110' },
    });
    expect(result).toEqual({ ok: true, subscription: { close: h.close } });
  });

  it('retains session state across adjacent and following same-bucket stream observations', () => {
    const h = harness();
    const updateLatestCandle = vi.fn();
    const onDisposition = vi.fn();
    subscribeBinanceAnalysisLiveCandleBrowserSession({
      instrument, interval: '1m', initialCandle, renderer: renderer(updateLatestCandle),
      receiptTimestamp: h.receiptTimestamp, scheduler: h.scheduler,
      reconnectPolicy: h.reconnectPolicy, reconnectSample: h.reconnectSample,
      onBackfillRequired: vi.fn(), onDisposition, subscribe: h.subscribe,
    });

    h.getHandlers()?.onPrice(observation('2026-09-13T07:01:02.000Z', '102'));
    h.getHandlers()?.onPrice(observation('2026-09-13T07:01:30.000Z', '108'));
    expect(updateLatestCandle).toHaveBeenCalledTimes(2);
    expect(updateLatestCandle.mock.calls[1][0]).toMatchObject({
      openTime: '2026-09-13T07:01:00.000Z', open: '102', high: '108', low: '102', close: '108',
    });
    expect(onDisposition.mock.calls.map(([value]) => value.kind)).toEqual(['rendered-next', 'rendered-current']);
  });

  it('emits an exact backfill request across gaps without rendering', () => {
    const h = harness();
    const updateLatestCandle = vi.fn();
    const onBackfillRequired = vi.fn();
    const onDisposition = vi.fn();
    const gap = observation('2026-09-13T07:02:00.000Z', '112');
    subscribeBinanceAnalysisLiveCandleBrowserSession({
      instrument, interval: '1m', initialCandle, renderer: renderer(updateLatestCandle),
      receiptTimestamp: h.receiptTimestamp, scheduler: h.scheduler,
      reconnectPolicy: h.reconnectPolicy, reconnectSample: h.reconnectSample,
      onBackfillRequired, onDisposition, subscribe: h.subscribe,
    });

    h.getHandlers()?.onPrice(gap);
    expect(onBackfillRequired).toHaveBeenCalledWith({ instrument, interval: '1m', observation: gap });
    expect(onDisposition).toHaveBeenCalledWith({ kind: 'backfill-required' });
    expect(updateLatestCandle).not.toHaveBeenCalled();
  });

  it('surfaces stale and rejected observations without rendering or inventing backfill', () => {
    const h = harness();
    const updateLatestCandle = vi.fn();
    const onBackfillRequired = vi.fn();
    const onDisposition = vi.fn();
    subscribeBinanceAnalysisLiveCandleBrowserSession({
      instrument, interval: '1m', initialCandle, renderer: renderer(updateLatestCandle),
      receiptTimestamp: h.receiptTimestamp, scheduler: h.scheduler,
      reconnectPolicy: h.reconnectPolicy, reconnectSample: h.reconnectSample,
      onBackfillRequired, onDisposition, subscribe: h.subscribe,
    });

    h.getHandlers()?.onPrice(observation('2026-09-13T06:59:59.999Z'));
    h.getHandlers()?.onPrice(observation(null));
    h.getHandlers()?.onPrice(observation('2026-09-13T07:00:30.000Z', '103', 'ETHUSDT'));
    expect(onDisposition.mock.calls.map(([value]) => value)).toEqual([
      { kind: 'ignored-stale' },
      { kind: 'rejected', reason: 'source-time-missing' },
      { kind: 'rejected', reason: 'instrument-mismatch' },
    ]);
    expect(updateLatestCandle).not.toHaveBeenCalled();
    expect(onBackfillRequired).not.toHaveBeenCalled();
  });

  it('forwards connection state, transport errors and close lifecycle unchanged', () => {
    const h = harness();
    const onStateChange = vi.fn();
    const onError = vi.fn();
    const result = subscribeBinanceAnalysisLiveCandleBrowserSession({
      instrument, interval: '1m', initialCandle, renderer: renderer(),
      receiptTimestamp: h.receiptTimestamp, scheduler: h.scheduler,
      reconnectPolicy: h.reconnectPolicy, reconnectSample: h.reconnectSample,
      onBackfillRequired: vi.fn(), onStateChange, onError, subscribe: h.subscribe,
    });

    h.getHandlers()?.onStateChange?.('live');
    const failure = new Error('transport-failed');
    h.getHandlers()?.onError?.(failure);
    if (result.ok) result.subscription.close();
    expect(onStateChange).toHaveBeenCalledWith('live');
    expect(onError).toHaveBeenCalledWith(failure);
    expect(h.close).toHaveBeenCalledTimes(1);
  });

  it('returns subscription validation failure unchanged', () => {
    const subscribe = vi.fn<BinanceAnalysisLiveCandleSubscription>(() => ({ ok: false, reason: 'venue-mismatch' }));
    const result = subscribeBinanceAnalysisLiveCandleBrowserSession({
      instrument, interval: '1m', initialCandle, renderer: renderer(),
      receiptTimestamp: () => '2026-09-13T07:01:10.000Z',
      scheduler: { schedule: vi.fn(), cancel: vi.fn() },
      reconnectPolicy: { initialDelayMs: 100, maxDelayMs: 1000, maxAttempts: 4 },
      reconnectSample: () => 0.5, onBackfillRequired: vi.fn(), subscribe,
    });

    expect(result).toEqual({ ok: false, reason: 'venue-mismatch' });
  });
});
