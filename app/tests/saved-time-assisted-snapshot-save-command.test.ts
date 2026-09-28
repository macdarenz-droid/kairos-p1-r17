import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TimeAssistedTradeSnapshot } from '../src/application/market-reference';
import { saveSavedTimeAssistedSnapshot } from '../src/application/saved-time-assisted-snapshot';
import { createKairosDatabase, inspectKairosDatabaseIntegrity, openKairosDatabase } from '../src/data/database';
import type { DecimalString } from '../src/domain/trades/tradeTypes';

const names: string[] = [];
const dbName = (label: string) => { const name = `kairos-p23-3-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const candle = { openTime: '2026-09-10T02:13:00.000Z', closeTime: '2026-09-10T02:13:59.999Z', open: '2100.5' as DecimalString, high: '2104' as DecimalString, low: '2099.25' as DecimalString, close: '2102' as DecimalString };
const snapshot: TimeAssistedTradeSnapshot = Object.freeze({
  kind: 'snapshot', isEstimate: true, source: 'market-reference', instrument, side: 'long',
  opening: Object.freeze({ kind: 'candle-range', isEstimate: true, source: 'market-reference', method: 'containing-candle', resolution: '1m', instrument, requestedAt: '2026-09-10T02:13:27Z', requestedAtUtc: '2026-09-10T02:13:27.000Z', candle, gapMs: 27_000, acquiredAt: '2026-09-17T12:00:00.000Z' }),
  closing: Object.freeze({ kind: 'unavailable', instrument, requestedAt: '2026-09-10T04:30:05Z', reason: 'no-candle' }),
  durationMs: 8_198_000,
}) as TimeAssistedTradeSnapshot;
const input = Object.freeze({ snapshot, inputTimeZone: 'Europe/Berlin' });
const now = () => Date.parse('2026-09-18T05:00:00.000Z');

describe('P23.3 saved time-assisted snapshot application save orchestration', () => {
  it('allocates a fresh id, composes the P23.1 record from the composed P22.2 snapshot and persists exactly one record', async () => {
    const db = createKairosDatabase(dbName('save'));
    await openKairosDatabase(db);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('22222222-2222-4222-8222-222222222222');

    const result = await saveSavedTimeAssistedSnapshot(db, input, { now });

    const expected = {
      id: '22222222-2222-4222-8222-222222222222',
      market: { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' },
      side: 'long',
      openedAt: '2026-09-10T02:13:27Z',
      openedAtUtc: '2026-09-10T02:13:27.000Z',
      closedAt: '2026-09-10T04:30:05Z',
      closedAtUtc: '2026-09-10T04:30:05.000Z',
      inputTimeZone: 'Europe/Berlin',
      opening: snapshot.opening,
      closing: snapshot.closing,
      durationMs: 8_198_000,
      savedAt: '2026-09-18T05:00:00.000Z',
      isEstimate: true,
      source: 'market-reference',
    };
    expect(result).toEqual({ ok: true, savedTimeAssistedSnapshotId: '22222222-2222-4222-8222-222222222222', record: expected });
    expect(await db.savedTimeAssistedSnapshots.toArray()).toEqual([expected]);
    expect(JSON.stringify(expected)).not.toMatch(/"price"|"pnl"|"result"|executionId|tradeId/);
    await expect(inspectKairosDatabaseIntegrity(db)).resolves.toMatchObject({ ok: true, savedTimeAssistedSnapshotRecordCount: 1 });
    db.close();
  });

  it('keeps an open trade open: null closing, null closed instants and null duration', async () => {
    const db = createKairosDatabase(dbName('open'));
    await openKairosDatabase(db);
    const open: TimeAssistedTradeSnapshot = { ...snapshot, closing: null, durationMs: null };
    const result = await saveSavedTimeAssistedSnapshot(db, { snapshot: open, inputTimeZone: 'UTC' }, { now });
    expect(result.ok).toBe(true);
    const [stored] = await db.savedTimeAssistedSnapshots.toArray();
    expect(stored).toMatchObject({ closedAt: null, closedAtUtc: null, closing: null, durationMs: null, inputTimeZone: 'UTC' });
    db.close();
  });

  it('rejects an uncomposed snapshot, an empty time zone and unparseable estimate instants without writing', async () => {
    const db = createKairosDatabase(dbName('invalid'));
    await openKairosDatabase(db);
    await expect(saveSavedTimeAssistedSnapshot(db, { snapshot: { kind: 'invalid', reason: 'side-invalid' } as unknown as TimeAssistedTradeSnapshot, inputTimeZone: 'UTC' })).resolves.toEqual({ ok: false, type: 'invalid-input', reason: 'snapshot-not-composed' });
    await expect(saveSavedTimeAssistedSnapshot(db, { snapshot, inputTimeZone: '  ' })).resolves.toEqual({ ok: false, type: 'invalid-input', reason: 'time-zone-invalid' });
    await expect(saveSavedTimeAssistedSnapshot(db, { snapshot: { ...snapshot, opening: { ...snapshot.opening, requestedAt: 'not-an-instant' } }, inputTimeZone: 'UTC' })).resolves.toEqual({ ok: false, type: 'invalid-input', reason: 'opened-at-invalid' });
    await expect(saveSavedTimeAssistedSnapshot(db, { snapshot: { ...snapshot, closing: { kind: 'unavailable', instrument, requestedAt: '', reason: 'no-candle' } }, inputTimeZone: 'UTC' })).resolves.toEqual({ ok: false, type: 'invalid-input', reason: 'closed-at-invalid' });
    expect(await db.savedTimeAssistedSnapshots.count()).toBe(0);
    db.close();
  });

  it('returns an explicit storage error and leaves no record on write failure', async () => {
    const db = createKairosDatabase(dbName('failure'));
    await openKairosDatabase(db);
    db.savedTimeAssistedSnapshots.hook('creating', () => { throw new Error('synthetic-write-failure'); });
    const result = await saveSavedTimeAssistedSnapshot(db, input, { now });
    expect(result).toEqual({ ok: false, type: 'storage-error', reason: 'saved-time-assisted-snapshot-save-failed' });
    expect(await db.savedTimeAssistedSnapshots.count()).toBe(0);
    db.close();
  });

  it('does not mutate the caller-owned snapshot while persisting it', async () => {
    const db = createKairosDatabase(dbName('clone'));
    await openKairosDatabase(db);
    const before = JSON.stringify(input);
    const result = await saveSavedTimeAssistedSnapshot(db, input, { now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.opening).toEqual(snapshot.opening);
    expect(result.record.opening).not.toBe(snapshot.opening);
    expect(result.record.closing).not.toBe(snapshot.closing);
    expect(JSON.stringify(input)).toBe(before);
    db.close();
  });
});
