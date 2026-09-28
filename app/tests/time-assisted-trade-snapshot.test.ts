import { describe, expect, it, vi } from 'vitest';
import { composeTimeAssistedTradeSnapshot } from '../src/application/market-reference';
import type { MarketCandleHistoryRequest, MarketCandleHistoryResult } from '../src/services/market-data/MarketCandleHistoryPort';
import type { DecimalString } from '../src/domain/trades/tradeTypes';

const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const candleAt = (startTimeMs: number) => ({ openTime: new Date(startTimeMs).toISOString(), closeTime: new Date(startTimeMs + 59_999).toISOString(), open: '2100' as DecimalString, high: '2104' as DecimalString, low: '2099' as DecimalString, close: '2102' as DecimalString });
const port = (missing: number[] = []) => ({ acquireHistory: vi.fn(async (request: MarketCandleHistoryRequest): Promise<MarketCandleHistoryResult> => ({ ok: true, snapshot: { source: 'market-reference', timeZone: 'UTC', request, observedAt: '2026-09-17T12:00:00.000Z', candles: missing.includes(request.startTimeMs!) ? [] : [candleAt(request.startTimeMs!)] } })) });
const now = () => Date.parse('2026-09-17T12:00:00.000Z');

describe('P22.2 time-assisted trade snapshot', () => {
  it('resolves the opening and closing estimates through P22.1 and carries side and exact duration, never a price or result', async () => {
    const p = port();
    const result = await composeTimeAssistedTradeSnapshot(p, { instrument, side: 'long', openedAt: '2026-09-10T04:00:10+02:00', closedAt: '2026-09-10T06:30:00+02:00' }, { now });
    expect(result.kind).toBe('snapshot');
    if (result.kind !== 'snapshot') return;
    expect(p.acquireHistory).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ isEstimate: true, source: 'market-reference', side: 'long', durationMs: 2 * 3_600_000 + 29 * 60_000 + 50_000, opening: { kind: 'candle-range', requestedAtUtc: '2026-09-10T02:00:10.000Z', gapMs: 10_000 }, closing: { kind: 'candle-range', requestedAtUtc: '2026-09-10T04:30:00.000Z', gapMs: 0 } });
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/"price"|"pnl"|"result"|executionId/);
  });

  it('keeps an open trade with a null closing estimate and duration', async () => {
    const p = port();
    const result = await composeTimeAssistedTradeSnapshot(p, { instrument, side: 'short', openedAt: '2026-09-10T02:00:00.000Z', closedAt: null }, { now });
    expect(result).toMatchObject({ kind: 'snapshot', side: 'short', closing: null, durationMs: null, opening: { kind: 'candle-range' } });
    expect(p.acquireHistory).toHaveBeenCalledTimes(1);
  });

  it('reports each instant\'s availability on its own', async () => {
    const closedStart = Date.parse('2026-09-10T04:30:00.000Z');
    const result = await composeTimeAssistedTradeSnapshot(port([closedStart]), { instrument, side: 'long', openedAt: '2026-09-10T02:00:10.000Z', closedAt: '2026-09-10T04:30:00.000Z' }, { now });
    expect(result).toMatchObject({ kind: 'snapshot', opening: { kind: 'candle-range' }, closing: { kind: 'unavailable', reason: 'no-candle' }, durationMs: 8_990_000 });
  });

  it('rejects an invalid request before any port call', async () => {
    const p = port();
    expect(await composeTimeAssistedTradeSnapshot(p, { instrument, side: 'flat' as never, openedAt: '2026-09-10T02:00:00.000Z', closedAt: null }, { now })).toEqual({ kind: 'invalid', reason: 'side-invalid' });
    expect(await composeTimeAssistedTradeSnapshot(p, { instrument, side: 'long', openedAt: 'noon', closedAt: null }, { now })).toEqual({ kind: 'invalid', reason: 'opened-at-invalid' });
    expect(await composeTimeAssistedTradeSnapshot(p, { instrument, side: 'long', openedAt: '2026-09-10T02:00:00.000Z', closedAt: 'later' }, { now })).toEqual({ kind: 'invalid', reason: 'closed-at-invalid' });
    expect(await composeTimeAssistedTradeSnapshot(p, { instrument, side: 'long', openedAt: '2026-09-10T02:00:00.000Z', closedAt: '2026-09-10T01:59:59.999Z' }, { now })).toEqual({ kind: 'invalid', reason: 'closed-before-opened' });
    expect(p.acquireHistory).not.toHaveBeenCalled();
    // A future opening instant is a P22.1 unavailable estimate, not a request rejection.
    expect(await composeTimeAssistedTradeSnapshot(p, { instrument, side: 'long', openedAt: '2026-09-17T12:00:01.000Z', closedAt: null }, { now })).toMatchObject({ kind: 'snapshot', opening: { kind: 'unavailable', reason: 'future-instant' } });
    expect(p.acquireHistory).not.toHaveBeenCalled();
  });
});
