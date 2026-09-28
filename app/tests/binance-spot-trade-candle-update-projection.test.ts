import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import { projectBinanceSpotTradeCandleUpdate } from '../src/services/market-data';
import type { MarketCandle } from '../src/services/market-data/MarketCandleHistoryPort';

const instrument = { venue: 'binance-spot', symbol: 'BTCUSDT' } as const;
const d = (value: string) => value as DecimalString;
const candle: MarketCandle = {
  openTime: '2026-09-13T05:00:00.000Z',
  closeTime: '2026-09-13T05:00:59.999Z',
  open: d('100'), high: d('105'), low: d('95'), close: d('101'),
};
const observation = (sourceTimestamp: string | null, price = '103', symbol = 'BTCUSDT') => ({
  instrument: { venue: 'binance-spot', symbol }, price: d(price), observedAt: '2026-09-13T05:01:01.000Z', sourceTimestamp,
} as const);

describe('P16.19 Binance Spot trade-to-candle projection', () => {
  it('updates only the forming candle while preserving its open and exact UTC bounds', () => {
    expect(projectBinanceSpotTradeCandleUpdate(instrument, '1m', candle, observation('2026-09-13T05:00:30.000Z', '110'))).toEqual({
      ok: true, kind: 'updated-current', candle: { ...candle, high: '110', close: '110' },
    });
    expect(projectBinanceSpotTradeCandleUpdate(instrument, '1m', candle, observation('2026-09-13T05:00:40.000Z', '90'))).toEqual({
      ok: true, kind: 'updated-current', candle: { ...candle, low: '90', close: '90' },
    });
  });

  it('appends exactly one adjacent candle from the first observed trade without manufacturing volume or journal facts', () => {
    expect(projectBinanceSpotTradeCandleUpdate(instrument, '1m', candle, observation('2026-09-13T05:01:02.345Z', '102.50'))).toEqual({
      ok: true,
      kind: 'appended-next',
      candle: {
        openTime: '2026-09-13T05:01:00.000Z', closeTime: '2026-09-13T05:01:59.999Z',
        open: '102.50', high: '102.50', low: '102.50', close: '102.50',
      },
    });
  });

  it('ignores stale observations and requires authoritative backfill across a gap', () => {
    expect(projectBinanceSpotTradeCandleUpdate(instrument, '1m', candle, observation('2026-09-13T04:59:59.999Z'))).toEqual({ ok: true, kind: 'ignored-stale' });
    expect(projectBinanceSpotTradeCandleUpdate(instrument, '1m', candle, observation('2026-09-13T05:02:00.000Z'))).toEqual({ ok: false, reason: 'gap-requires-backfill' });
  });

  it('fails closed on identity, source-time, interval and current-boundary mismatches', () => {
    expect(projectBinanceSpotTradeCandleUpdate(instrument, '1m', candle, observation('2026-09-13T05:00:30.000Z', '103', 'ETHUSDT'))).toEqual({ ok: false, reason: 'instrument-mismatch' });
    expect(projectBinanceSpotTradeCandleUpdate(instrument, '7m', candle, observation('2026-09-13T05:00:30.000Z'))).toEqual({ ok: false, reason: 'interval-unsupported' });
    expect(projectBinanceSpotTradeCandleUpdate(instrument, '1m', candle, observation(null))).toEqual({ ok: false, reason: 'source-time-missing' });
    expect(projectBinanceSpotTradeCandleUpdate(instrument, '1m', { ...candle, closeTime: '2026-09-13T05:01:00.000Z' }, observation('2026-09-13T05:00:30.000Z'))).toEqual({ ok: false, reason: 'current-candle-invalid' });
  });

  it('uses calendar-month UTC boundaries rather than a fixed duration', () => {
    const august: MarketCandle = { openTime: '2026-08-01T00:00:00.000Z', closeTime: '2026-08-31T23:59:59.999Z', open: d('1'), high: d('2'), low: d('1'), close: d('2') };
    expect(projectBinanceSpotTradeCandleUpdate(instrument, '1M', august, observation('2026-09-15T12:00:00.000Z', '3'))).toMatchObject({
      ok: true, kind: 'appended-next', candle: { openTime: '2026-09-01T00:00:00.000Z', closeTime: '2026-09-30T23:59:59.999Z' },
    });
  });

  it('preserves Binance Monday UTC weekly boundaries', () => {
    const week: MarketCandle = { openTime: '2026-09-07T00:00:00.000Z', closeTime: '2026-09-13T23:59:59.999Z', open: d('1'), high: d('2'), low: d('1'), close: d('2') };
    expect(projectBinanceSpotTradeCandleUpdate(instrument, '1w', week, observation('2026-09-14T10:00:00.000Z', '3'))).toMatchObject({
      ok: true, kind: 'appended-next', candle: { openTime: '2026-09-14T00:00:00.000Z', closeTime: '2026-09-20T23:59:59.999Z' },
    });
  });
});
