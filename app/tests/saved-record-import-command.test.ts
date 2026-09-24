import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineSavedAnalysis } from '../src/domain/saved-records/savedAnalysisContract';
import { defineSavedTimeAssistedSnapshot } from '../src/domain/saved-records/savedTimeAssistedSnapshotContract';
import { commitSavedRecordImport, exportKairosBackup, prepareSavedRecordImport } from '../src/application/backup';
import { listSavedRecordIndex } from '../src/application/library';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const names: string[] = [];
async function database(label: string) { const name = `kairos-p33-1-${label}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });
const now = () => '2026-09-18T17:30:00.000Z';
const eth = { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' } as const;
const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const analysis = (id: string, label?: string) => defineSavedAnalysis({ id, market: eth, drawings: [{ id: `${id}-d`, kind: 'trend-line', start: { timestamp: '2026-09-10T02:00:00.000Z', price: '2100' as never }, end: { timestamp: '2026-09-10T03:00:00.000Z', price: '2300' as never } }], riskRewards: [], ...(label === undefined ? {} : { label }) });
const snapshot = (id: string, label?: string) => defineSavedTimeAssistedSnapshot({ id, market: eth, side: 'short', openedAt: '2026-09-10T02:13:27', openedAtUtc: '2026-09-10T02:13:27.000Z', closedAt: null, closedAtUtc: null, inputTimeZone: 'UTC', opening: { kind: 'unavailable', instrument, requestedAt: '2026-09-10T02:13:27', reason: 'no-candle' }, closing: null, durationMs: null, savedAt: '2026-09-18T03:30:00.000Z', isEstimate: true, source: 'market-reference', ...(label === undefined ? {} : { label }) });

async function otherDeviceBackup() {
  const other = await database('other');
  const repositories = createKairosRepositories(other);
  await repositories.savedAnalyses.put(analysis('a-shared', 'Shared plan'));
  await repositories.savedAnalyses.put(analysis('a-other', 'Other plan'));
  await repositories.savedTimeAssistedSnapshots.put(snapshot('s-other', 'Other scalp'));
  await saveManualTrade(other, { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt: '2026-09-18T09:00:00.000Z' }, { now });
  const exported = await exportKairosBackup(other, new Date(now()));
  if (!exported.ok) throw new Error('fixture');
  return exported.file.contents;
}

describe('P33.1 saved-record merge-import command', () => {
  it('previews the saved records this device lacks and adds exactly them, byte-identical with their labels, on confirmation', async () => {
    const db = await database('merge');
    const repositories = createKairosRepositories(db);
    await repositories.savedAnalyses.put(analysis('a-shared', 'My shared plan'));
    await repositories.savedTimeAssistedSnapshots.put(snapshot('s-mine'));
    const backup = await otherDeviceBackup();
    const prepared = await prepareSavedRecordImport(db, backup);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) throw new Error('unreachable');
    expect(prepared.import.preview).toEqual({ exportedAt: now(), formatVersion: 5, newAnalyses: 1, newSnapshots: 1, analysesPresent: 1, snapshotsPresent: 0 });
    expect(await db.savedAnalyses.count()).toBe(1);
    expect(await db.trades.count()).toBe(0);
    const result = await commitSavedRecordImport(db, prepared.import);
    expect(result).toEqual({ ok: true, added: { analyses: 1, snapshots: 1 }, skipped: 0 });
    expect(await repositories.savedAnalyses.get('a-other')).toEqual(analysis('a-other', 'Other plan'));
    expect(await repositories.savedTimeAssistedSnapshots.get('s-other')).toEqual(snapshot('s-other', 'Other scalp'));
    expect((await repositories.savedAnalyses.get('a-shared'))?.label).toBe('My shared plan');
    expect(await db.trades.count()).toBe(0);
    const index = await listSavedRecordIndex(db);
    expect(index.entries.map(entry => `${entry.kind}:${entry.id}`).sort()).toEqual(['analysis:a-other', 'analysis:a-shared', 'snapshot:s-mine', 'snapshot:s-other']);
  });

  it('skips a record that appears between preview and confirmation and never replaces it', async () => {
    const db = await database('skip');
    const repositories = createKairosRepositories(db);
    const backup = await otherDeviceBackup();
    const prepared = await prepareSavedRecordImport(db, backup);
    if (!prepared.ok) throw new Error('unreachable');
    await repositories.savedAnalyses.put(analysis('a-other', 'Local first'));
    expect(await commitSavedRecordImport(db, prepared.import)).toEqual({ ok: true, added: { analyses: 1, snapshots: 1 }, skipped: 1 });
    expect((await repositories.savedAnalyses.get('a-other'))?.label).toBe('Local first');
    expect((await repositories.savedAnalyses.listAll()).map(record => record.id).sort()).toEqual(['a-other', 'a-shared']);
  });

  it('refuses an over-size file, a non-backup and an inconsistent backup, and reports storage failures, writing nothing', async () => {
    const db = await database('refuse');
    expect(await prepareSavedRecordImport(db, 'x'.repeat(64 * 1024 * 1024 + 1))).toMatchObject({ ok: false, type: 'invalid-input', reason: 'backup-file-too-large' });
    expect(await prepareSavedRecordImport(db, '{"formatName":"other"}')).toEqual({ ok: false, type: 'invalid-backup', reason: 'backup-unreadable', code: 'FORMAT_NAME_MISMATCH' });
    const backup = await otherDeviceBackup();
    const duplicate = JSON.parse(backup) as { payload: { savedAnalyses: unknown[] }; recordCounts: { savedAnalyses: number; total: number } };
    duplicate.payload.savedAnalyses.push(duplicate.payload.savedAnalyses[0]);
    duplicate.recordCounts.savedAnalyses += 1; duplicate.recordCounts.total += 1;
    expect(await prepareSavedRecordImport(db, JSON.stringify(duplicate))).toEqual({ ok: false, type: 'incompatible-backup', reason: 'import-preflight-refused', code: 'DUPLICATE_SAVED_ANALYSIS_ID' });
    const prepared = await prepareSavedRecordImport(db, backup);
    if (!prepared.ok) throw new Error('unreachable');
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    expect(await prepareSavedRecordImport(db, backup)).toEqual({ ok: false, type: 'storage-error', reason: 'import-prepare-failed' });
    expect(await commitSavedRecordImport(db, prepared.import)).toEqual({ ok: false, type: 'storage-error', reason: 'import-commit-failed' });
    vi.restoreAllMocks();
    expect(await db.savedAnalyses.count()).toBe(0);
    expect(await db.savedTimeAssistedSnapshots.count()).toBe(0);
  });
});
