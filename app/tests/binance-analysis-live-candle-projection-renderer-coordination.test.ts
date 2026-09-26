import { describe, expect, it, vi } from 'vitest';
import { createBinanceAnalysisLiveCandleProjectionRendererSession } from '../src/app/binanceAnalysisLiveCandleProjectionRendererCoordination';
import type { DecimalString } from '../src/domain/trades';
import type { ProjectedIncrementalCandleRendererLifecycle } from '../src/features/chart';
import type { MarketCandle } from '../src/services/market-data/MarketCandleHistoryPort';

const d = (value: string) => value as DecimalString;
const instrument = { venue: 'binance-spot', symbol: 'BTCUSDT' } as const;
const initial: MarketCandle = {
  openTime: '2026-09-13T05:00:00.000Z',
  closeTime: '2026-09-13T05:00:59.999Z',
  open: d('100'), high: d('105'), low: d('95'), close: d('101'),
};
const observation = (sourceTimestamp: string | null, price = '103', symbol = 'BTCUSDT') => ({
  instrument: { venue: 'binance-spot', symbol },
  price: d(price),
  observedAt: '2026-09-13T05:01:10.000Z',
  sourceTimestamp,
} as const);

function renderer(updateLatestCandle = vi.fn()): ProjectedIncrementalCandleRendererLifecycle {
  return { render: vi.fn(), updateLatestCandle, destroy: vi.fn() };
}

describe('Analysis live candle projection-to-renderer coordination', () => {
  it('renders a same-bucket update and advances current state only to the projected candle', () => {
    const updateLatestCandle = vi.fn();
    const session = createBinanceAnalysisLiveCandleProjectionRendererSession({
      instrument, interval: '1m', initialCandle: initial,
      renderer: renderer(updateLatestCandle), onBackfillRequired: vi.fn(),
    });

    expect(session.accept(observation('2026-09-13T05:00:30.000Z', '110'))).toEqual({
      kind: 'rendered-current', candle: { ...initial, high: '110', close: '110' },
    });
    expect(updateLatestCandle).toHaveBeenCalledWith({ ...initial, high: '110', close: '110' });
    expect(session.currentCandle()).toEqual({ ...initial, high: '110', close: '110' });
  });

  it('renders one adjacent candle and uses it for the following current-bucket update', () => {
    const updateLatestCandle = vi.fn();
    const session = createBinanceAnalysisLiveCandleProjectionRendererSession({
      instrument, interval: '1m', initialCandle: initial,
      renderer: renderer(updateLatestCandle), onBackfillRequired: vi.fn(),
    });

    expect(session.accept(observation('2026-09-13T05:01:02.000Z', '102'))).toMatchObject({
      kind: 'rendered-next', candle: { openTime: '2026-09-13T05:01:00.000Z', close: '102' },
    });
    expect(session.accept(observation('2026-09-13T05:01:30.000Z', '108'))).toMatchObject({
      kind: 'rendered-current', candle: { open: '102', high: '108', low: '102', close: '108' },
    });
    expect(updateLatestCandle).toHaveBeenCalledTimes(2);
  });

  it('ignores stale observations without rendering or changing the current candle', () => {
    const updateLatestCandle = vi.fn();
    const session = createBinanceAnalysisLiveCandleProjectionRendererSession({
      instrument, interval: '1m', initialCandle: initial,
      renderer: renderer(updateLatestCandle), onBackfillRequired: vi.fn(),
    });

    expect(session.accept(observation('2026-09-13T04:59:59.999Z'))).toEqual({ kind: 'ignored-stale' });
    expect(updateLatestCandle).not.toHaveBeenCalled();
    expect(session.currentCandle()).toBe(initial);
  });

  it('signals authoritative backfill across a gap without rendering or advancing state', () => {
    const updateLatestCandle = vi.fn();
    const onBackfillRequired = vi.fn();
    const gap = observation('2026-09-13T05:02:00.000Z', '112');
    const session = createBinanceAnalysisLiveCandleProjectionRendererSession({
      instrument, interval: '1m', initialCandle: initial,
      renderer: renderer(updateLatestCandle), onBackfillRequired,
    });

    expect(session.accept(gap)).toEqual({ kind: 'backfill-required' });
    expect(onBackfillRequired).toHaveBeenCalledWith({ instrument, interval: '1m', observation: gap });
    expect(updateLatestCandle).not.toHaveBeenCalled();
    expect(session.currentCandle()).toBe(initial);
  });

  it('fails closed on invalid identity or missing source time without requesting backfill', () => {
    const updateLatestCandle = vi.fn();
    const onBackfillRequired = vi.fn();
    const session = createBinanceAnalysisLiveCandleProjectionRendererSession({
      instrument, interval: '1m', initialCandle: initial,
      renderer: renderer(updateLatestCandle), onBackfillRequired,
    });

    expect(session.accept(observation('2026-09-13T05:00:30.000Z', '103', 'ETHUSDT'))).toEqual({ kind: 'rejected', reason: 'instrument-mismatch' });
    expect(session.accept(observation(null))).toEqual({ kind: 'rejected', reason: 'source-time-missing' });
    expect(updateLatestCandle).not.toHaveBeenCalled();
    expect(onBackfillRequired).not.toHaveBeenCalled();
  });

  it('does not advance current state when the renderer rejects an update', () => {
    const updateLatestCandle = vi.fn(() => { throw new Error('renderer-failed'); });
    const session = createBinanceAnalysisLiveCandleProjectionRendererSession({
      instrument, interval: '1m', initialCandle: initial,
      renderer: renderer(updateLatestCandle), onBackfillRequired: vi.fn(),
    });

    expect(() => session.accept(observation('2026-09-13T05:00:30.000Z', '110'))).toThrow('renderer-failed');
    expect(session.currentCandle()).toBe(initial);
  });
});
