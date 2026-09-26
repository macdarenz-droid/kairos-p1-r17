import { describe, expect, it } from 'vitest';
import { defineSavedTimeAssistedSnapshot, type SavedTimeAssistedSnapshot } from '../src/domain/saved-records/savedTimeAssistedSnapshotContract';
import { createSavedTimeAssistedSnapshotId } from '../src/domain/saved-records/savedTimeAssistedSnapshotIdentity';
import type { DecimalString } from '../src/domain/trades/tradeTypes';

const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const candle = { openTime: '2026-09-10T02:13:00.000Z', closeTime: '2026-09-10T02:13:59.999Z', open: '2100.5' as DecimalString, high: '2104' as DecimalString, low: '2099.25' as DecimalString, close: '2102' as DecimalString };

describe('P23.1 saved time-assisted snapshot contract', () => {
  it('composes the market reference, side, entered and UTC instants, device time zone and the P22.1 estimates with their provenance, and nothing else', () => {
    const record = defineSavedTimeAssistedSnapshot({
      id: createSavedTimeAssistedSnapshotId(),
      market: { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' },
      side: 'long',
      openedAt: '2026-09-10T04:13:27',
      openedAtUtc: '2026-09-10T02:13:27.000Z',
      closedAt: null,
      closedAtUtc: null,
      inputTimeZone: 'Europe/Berlin',
      opening: { kind: 'candle-range', isEstimate: true, source: 'market-reference', method: 'containing-candle', resolution: '1m', instrument, requestedAt: '2026-09-10T04:13:27', requestedAtUtc: '2026-09-10T02:13:27.000Z', candle, gapMs: 27_000, acquiredAt: '2026-09-17T12:00:00.000Z' },
      closing: null,
      durationMs: null,
      savedAt: '2026-09-18T03:30:00.000Z',
      isEstimate: true,
      source: 'market-reference',
    });
    expect(Object.keys(record).sort()).toEqual(['closedAt', 'closedAtUtc', 'closing', 'durationMs', 'id', 'inputTimeZone', 'isEstimate', 'market', 'openedAt', 'openedAtUtc', 'opening', 'savedAt', 'side', 'source']);
    expect(JSON.stringify(record)).not.toMatch(/"price"|"pnl"|"result"|executionId|tradeId/);
    expect(record.opening).toMatchObject({ method: 'containing-candle', resolution: '1m', gapMs: 27_000, acquiredAt: '2026-09-17T12:00:00.000Z' });
  });

  it('keeps an unavailable estimate representable so a saved snapshot records exactly what could and could not be estimated', () => {
    const record: SavedTimeAssistedSnapshot = {
      id: 'saved-1', market: { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' }, side: 'short',
      openedAt: '2026-09-10T02:13:27Z', openedAtUtc: '2026-09-10T02:13:27.000Z', closedAt: '2026-09-10T04:30:05Z', closedAtUtc: '2026-09-10T04:30:05.000Z', inputTimeZone: 'UTC',
      opening: { kind: 'unavailable', instrument, requestedAt: '2026-09-10T02:13:27Z', reason: 'no-candle' },
      closing: { kind: 'unavailable', instrument, requestedAt: '2026-09-10T04:30:05Z', reason: 'transport-failed' },
      durationMs: 8_198_000, savedAt: '2026-09-18T03:30:00.000Z', isEstimate: true, source: 'market-reference',
    };
    expect(defineSavedTimeAssistedSnapshot(record)).toBe(record);
  });

  it('allocates fresh, distinct, UUID-shaped identities', () => {
    const a = createSavedTimeAssistedSnapshotId(), b = createSavedTimeAssistedSnapshotId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });
});
