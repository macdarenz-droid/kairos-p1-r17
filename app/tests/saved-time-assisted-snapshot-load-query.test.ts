import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { defineSavedTimeAssistedSnapshot } from '../src/domain/saved-records/savedTimeAssistedSnapshotContract';
import { listSavedTimeAssistedSnapshots, loadSavedTimeAssistedSnapshot } from '../src/application/saved-time-assisted-snapshot';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const names: string[] = [];
const dbName = (label: string) => { const name = `kairos-p23-4-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const saved = defineSavedTimeAssistedSnapshot({
  id: 'snapshot-1', market: { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' }, side: 'short',
  openedAt: '2026-09-10T02:13:27Z', openedAtUtc: '2026-09-10T02:13:27.000Z', closedAt: null, closedAtUtc: null, inputTimeZone: 'UTC',
  opening: { kind: 'unavailable', instrument, requestedAt: '2026-09-10T02:13:27Z', reason: 'no-candle' },
  closing: null, durationMs: null, savedAt: '2026-09-18T03:30:00.000Z', isEstimate: true, source: 'market-reference',
});

describe('P23.4 saved time-assisted snapshot application read orchestration', () => {
  it('loads one saved snapshot by its canonical stable id with a clone-safe result', async () => {
    const db = createKairosDatabase(dbName('load'));
    await openKairosDatabase(db);
    await createKairosRepositories(db).savedTimeAssistedSnapshots.put(saved);
    const result = await loadSavedTimeAssistedSnapshot(db, saved.id);
    expect(result).toEqual({ ok: true, savedTimeAssistedSnapshot: saved });
    if (result.ok) expect(result.savedTimeAssistedSnapshot).not.toBe(saved);
    db.close();
  });

  it('returns an explicit not-found result when the id has no record', async () => {
    const db = createKairosDatabase(dbName('missing'));
    await openKairosDatabase(db);
    expect(await loadSavedTimeAssistedSnapshot(db, 'missing-snapshot')).toEqual({ ok: false, type: 'not-found', reason: 'saved-time-assisted-snapshot-not-found' });
    db.close();
  });

  it('lists every saved snapshot newest save first, ties by id, and an empty store as an empty list', async () => {
    const db = createKairosDatabase(dbName('list'));
    await openKairosDatabase(db);
    expect(await listSavedTimeAssistedSnapshots(db)).toEqual({ ok: true, savedTimeAssistedSnapshots: [] });
    const repo = createKairosRepositories(db).savedTimeAssistedSnapshots;
    const older = defineSavedTimeAssistedSnapshot({ ...saved, id: 'snapshot-0', savedAt: '2026-09-17T03:30:00.000Z' });
    const tie = defineSavedTimeAssistedSnapshot({ ...saved, id: 'snapshot-2' });
    await repo.put(older); await repo.put(tie); await repo.put(saved);
    const result = await listSavedTimeAssistedSnapshots(db);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.savedTimeAssistedSnapshots.map((record) => record.id)).toEqual(['snapshot-1', 'snapshot-2', 'snapshot-0']);
    expect(result.savedTimeAssistedSnapshots[0]).toEqual(saved);
    expect(Object.isFrozen(result.savedTimeAssistedSnapshots)).toBe(true);
    db.close();
  });

  it('returns explicit storage errors when repository access fails', async () => {
    const db = createKairosDatabase(dbName('failure'));
    await openKairosDatabase(db);
    db.close();
    expect(await loadSavedTimeAssistedSnapshot(db, saved.id)).toEqual({ ok: false, type: 'storage-error', reason: 'saved-time-assisted-snapshot-load-failed' });
    expect(await listSavedTimeAssistedSnapshots(db)).toEqual({ ok: false, type: 'storage-error', reason: 'saved-time-assisted-snapshot-list-failed' });
  });
});
