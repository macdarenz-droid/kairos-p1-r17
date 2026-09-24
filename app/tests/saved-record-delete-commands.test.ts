import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { defineSavedAnalysis } from '../src/app/savedAnalysisContract';
import { defineSavedTimeAssistedSnapshot } from '../src/app/savedTimeAssistedSnapshotContract';
import { deleteSavedAnalysis } from '../src/application/saved-analysis';
import { deleteSavedTimeAssistedSnapshot } from '../src/application/saved-time-assisted-snapshot';
import { createKairosDatabase, inspectKairosDatabaseIntegrity, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const names: string[] = [];
const dbName = (label: string) => { const name = `kairos-p24-1-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const analysis = (id: string) => defineSavedAnalysis({ id, market: { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' }, drawings: [], riskRewards: [] });
const snapshot = (id: string) => defineSavedTimeAssistedSnapshot({
  id, market: { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' }, side: 'long',
  openedAt: '2026-09-10T02:13:27Z', openedAtUtc: '2026-09-10T02:13:27.000Z', closedAt: null, closedAtUtc: null, inputTimeZone: 'UTC',
  opening: { kind: 'unavailable', instrument, requestedAt: '2026-09-10T02:13:27Z', reason: 'no-candle' },
  closing: null, durationMs: null, savedAt: '2026-09-18T03:30:00.000Z', isEstimate: true, source: 'market-reference',
});
const journal = { id: 'trade-1', symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'open', source: 'manual', openedAt: '2026-09-01T00:00:00.000Z', closedAt: null, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' } as const;

describe('P24.1 saved record delete commands', () => {
  it('deletes exactly one Saved Analysis by canonical stable id and leaves every other record untouched', async () => {
    const db = createKairosDatabase(dbName('analysis'));
    await openKairosDatabase(db);
    const repos = createKairosRepositories(db);
    await repos.savedAnalyses.put(analysis('a-1')); await repos.savedAnalyses.put(analysis('a-2'));
    await repos.savedTimeAssistedSnapshots.put(snapshot('s-1'));
    await db.trades.put(journal as never);
    expect(await deleteSavedAnalysis(db, 'a-1')).toEqual({ ok: true, savedAnalysisId: 'a-1' });
    expect((await repos.savedAnalyses.listAll()).map(record => record.id)).toEqual(['a-2']);
    expect((await repos.savedTimeAssistedSnapshots.listAll()).map(record => record.id)).toEqual(['s-1']);
    expect(await db.trades.count()).toBe(1);
    await expect(inspectKairosDatabaseIntegrity(db)).resolves.toMatchObject({ ok: true, savedAnalysisRecordCount: 1, savedTimeAssistedSnapshotRecordCount: 1 });
    db.close();
  });

  it('deletes exactly one saved time-assisted snapshot by canonical stable id and leaves every other record untouched', async () => {
    const db = createKairosDatabase(dbName('snapshot'));
    await openKairosDatabase(db);
    const repos = createKairosRepositories(db);
    await repos.savedTimeAssistedSnapshots.put(snapshot('s-1')); await repos.savedTimeAssistedSnapshots.put(snapshot('s-2'));
    await repos.savedAnalyses.put(analysis('a-1'));
    await db.trades.put(journal as never);
    expect(await deleteSavedTimeAssistedSnapshot(db, 's-2')).toEqual({ ok: true, savedTimeAssistedSnapshotId: 's-2' });
    expect((await repos.savedTimeAssistedSnapshots.listAll()).map(record => record.id)).toEqual(['s-1']);
    expect((await repos.savedAnalyses.listAll()).map(record => record.id)).toEqual(['a-1']);
    expect(await db.trades.count()).toBe(1);
    db.close();
  });

  it('returns explicit not-found results for a missing id and writes nothing', async () => {
    const db = createKairosDatabase(dbName('missing'));
    await openKairosDatabase(db);
    const repos = createKairosRepositories(db);
    await repos.savedAnalyses.put(analysis('a-1')); await repos.savedTimeAssistedSnapshots.put(snapshot('s-1'));
    expect(await deleteSavedAnalysis(db, 'missing')).toEqual({ ok: false, type: 'not-found', reason: 'saved-analysis-not-found' });
    expect(await deleteSavedTimeAssistedSnapshot(db, 'missing')).toEqual({ ok: false, type: 'not-found', reason: 'saved-time-assisted-snapshot-not-found' });
    expect(await db.savedAnalyses.count()).toBe(1);
    expect(await db.savedTimeAssistedSnapshots.count()).toBe(1);
    db.close();
  });

  it('returns explicit storage errors when the write fails and keeps the record', async () => {
    const db = createKairosDatabase(dbName('failure'));
    await openKairosDatabase(db);
    const repos = createKairosRepositories(db);
    await repos.savedAnalyses.put(analysis('a-1')); await repos.savedTimeAssistedSnapshots.put(snapshot('s-1'));
    db.savedAnalyses.hook('deleting', () => { throw new Error('synthetic-delete-failure'); });
    db.savedTimeAssistedSnapshots.hook('deleting', () => { throw new Error('synthetic-delete-failure'); });
    expect(await deleteSavedAnalysis(db, 'a-1')).toEqual({ ok: false, type: 'storage-error', reason: 'saved-analysis-delete-failed' });
    expect(await deleteSavedTimeAssistedSnapshot(db, 's-1')).toEqual({ ok: false, type: 'storage-error', reason: 'saved-time-assisted-snapshot-delete-failed' });
    expect(await db.savedAnalyses.count()).toBe(1);
    expect(await db.savedTimeAssistedSnapshots.count()).toBe(1);
    db.close();
  });

  it('returns storage errors on a closed database', async () => {
    const db = createKairosDatabase(dbName('closed'));
    await openKairosDatabase(db);
    db.close();
    expect(await deleteSavedAnalysis(db, 'a-1')).toEqual({ ok: false, type: 'storage-error', reason: 'saved-analysis-delete-failed' });
    expect(await deleteSavedTimeAssistedSnapshot(db, 's-1')).toEqual({ ok: false, type: 'storage-error', reason: 'saved-time-assisted-snapshot-delete-failed' });
  });
});
