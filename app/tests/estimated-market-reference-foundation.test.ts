import { describe, expect, it, vi } from 'vitest';
import { estimateMarketReferenceAt, ESTIMATED_MARKET_REFERENCE_RESOLUTION } from '../src/application/market-reference';
import type { MarketCandleHistoryRequest, MarketCandleHistoryResult } from '../src/services/market-data/MarketCandleHistoryPort';
import type { DecimalString } from '../src/domain/trades/tradeTypes';

const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const candle = (openTime: string) => ({ openTime, closeTime: new Date(Date.parse(openTime) + 59_999).toISOString(), open: '2100.5' as DecimalString, high: '2104' as DecimalString, low: '2099.25' as DecimalString, close: '2102' as DecimalString });
const ok = (request: MarketCandleHistoryRequest, candles: ReturnType<typeof candle>[]): MarketCandleHistoryResult => ({ ok: true, snapshot: { source: 'market-reference', timeZone: 'UTC', request, observedAt: '2026-09-17T12:00:00.000Z', candles } });
const now = () => Date.parse('2026-09-17T12:00:00.000Z');

describe('P22.1 estimated market reference', () => {
  it('asks the released history port for exactly the containing one-minute candle and returns a disclosed range, never a fill', async () => {
    const acquireHistory = vi.fn(async (request: MarketCandleHistoryRequest) => ok(request, [candle('2026-09-10T02:13:00.000Z')]));
    const estimate = await estimateMarketReferenceAt({ acquireHistory }, { instrument, requestedAt: '2026-09-10T04:13:27+02:00' }, { now });
    expect(acquireHistory).toHaveBeenCalledTimes(1);
    expect(acquireHistory.mock.calls[0][0]).toEqual({ instrument, interval: ESTIMATED_MARKET_REFERENCE_RESOLUTION, limit: 1, startTimeMs: Date.parse('2026-09-10T02:13:00.000Z'), endTimeMs: Date.parse('2026-09-10T02:13:59.999Z') });
    expect(estimate).toEqual({
      kind: 'candle-range', isEstimate: true, source: 'market-reference', method: 'containing-candle', resolution: '1m', instrument,
      requestedAt: '2026-09-10T04:13:27+02:00', requestedAtUtc: '2026-09-10T02:13:27.000Z', candle: candle('2026-09-10T02:13:00.000Z'), gapMs: 27_000, acquiredAt: '2026-09-17T12:00:00.000Z',
    });
    expect(Object.isFrozen(estimate)).toBe(true);
    expect('price' in estimate).toBe(false);
  });

  it('fails closed without touching the port for invalid or future instants', async () => {
    const acquireHistory = vi.fn();
    expect(await estimateMarketReferenceAt({ acquireHistory }, { instrument, requestedAt: 'yesterday' }, { now })).toEqual({ kind: 'unavailable', instrument, requestedAt: 'yesterday', reason: 'invalid-instant' });
    expect(await estimateMarketReferenceAt({ acquireHistory }, { instrument, requestedAt: '2026-09-17T12:00:00.001Z' }, { now })).toEqual({ kind: 'unavailable', instrument, requestedAt: '2026-09-17T12:00:00.001Z', reason: 'future-instant' });
    expect(acquireHistory).not.toHaveBeenCalled();
  });

  it('reports the released port failure reasons, an empty page, and a candle that does not contain the instant', async () => {
    const at = '2026-09-10T02:13:27.000Z';
    expect(await estimateMarketReferenceAt({ acquireHistory: async () => ({ ok: false, reason: 'http-error', status: 429, retryAfter: '1' }) }, { instrument, requestedAt: at }, { now })).toMatchObject({ kind: 'unavailable', reason: 'http-error' });
    expect(await estimateMarketReferenceAt({ acquireHistory: async () => ({ ok: false, reason: 'transport-failed' }) }, { instrument, requestedAt: at }, { now })).toMatchObject({ kind: 'unavailable', reason: 'transport-failed' });
    expect(await estimateMarketReferenceAt({ acquireHistory: async request => ok(request, []) }, { instrument, requestedAt: at }, { now })).toMatchObject({ kind: 'unavailable', reason: 'no-candle' });
    expect(await estimateMarketReferenceAt({ acquireHistory: async request => ok(request, [candle('2026-09-10T02:14:00.000Z')]) }, { instrument, requestedAt: at }, { now })).toMatchObject({ kind: 'unavailable', reason: 'candle-mismatch' });
  });

  it('forwards the abort signal and only that option to the port', async () => {
    const controller = new AbortController();
    const acquireHistory = vi.fn(async (request: MarketCandleHistoryRequest, _options?: { readonly signal?: AbortSignal }) => ok(request, [candle('2026-09-10T02:13:00.000Z')]));
    await estimateMarketReferenceAt({ acquireHistory }, { instrument, requestedAt: '2026-09-10T02:13:00.000Z' }, { now, signal: controller.signal });
    expect(acquireHistory.mock.calls[0][1]).toEqual({ signal: controller.signal });
    await estimateMarketReferenceAt({ acquireHistory }, { instrument, requestedAt: '2026-09-10T02:13:59.999Z' }, { now });
    expect(acquireHistory.mock.calls[1][1]).toBeUndefined();
    expect((await estimateMarketReferenceAt({ acquireHistory }, { instrument, requestedAt: '2026-09-10T02:13:59.999Z' }, { now }))).toMatchObject({ kind: 'candle-range', gapMs: 59_999 });
  });
});
