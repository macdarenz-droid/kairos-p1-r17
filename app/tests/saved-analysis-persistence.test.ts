import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { defineSavedAnalysis, type SavedAnalysis } from '../src/domain/saved-records/savedAnalysisContract';
import { createKairosBackupEnvelope, parseKairosBackup, prepareKairosRestore, replaceKairosDatabaseFromPreparedRestore, serializeKairosBackup } from '../src/data/backup';
import { assertKairosDatabaseIntegrity, createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const names: string[] = [];
const dbName = (label: string) => { const name = `kairos-p20-2-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

const saved = defineSavedAnalysis({
  id: 'saved-analysis-p20-2',
  market: { venue: 'BINANCE', instrument: 'BTCUSDT', source: 'market-reference' },
  drawings: [],
  riskRewards: [],
});

describe('P20.2 Saved Analysis persistence foundation', () => {
  it('persists Saved Analysis through its repository with clone-safe reads', async () => {
    const db = createKairosDatabase(dbName('repo'));
    await openKairosDatabase(db);
    const repo = createKairosRepositories(db).savedAnalyses;
    await repo.put(saved);
    const loaded = await repo.get(saved.id);
    expect(loaded).toEqual(saved);
    expect(loaded).not.toBe(saved);
    await expect(assertKairosDatabaseIntegrity(db)).resolves.toMatchObject({ ok: true, schemaVersion: 11, savedAnalysisRecordCount: 1 });
    db.close();
  });

  it('round-trips Saved Analysis through current backup V4', () => {
    const envelope = createKairosBackupEnvelope({ metadata: [], savedAnalyses: [saved] });
    const parsed = parseKairosBackup(serializeKairosBackup(envelope));
    expect(parsed).toMatchObject({ formatVersion: 10, databaseSchemaVersion: 11, recordCounts: { savedAnalyses: 1, savedTimeAssistedSnapshots: 0, tradeDiscipline: 0, total: 1 } });
    expect(parsed.payload.savedAnalyses).toEqual([saved]);
  });

  it('replaces Saved Analysis atomically from a prepared restore', async () => {
    const db = createKairosDatabase(dbName('restore'));
    await openKairosDatabase(db);
    const current = defineSavedAnalysis({ ...saved, id: 'current-analysis' });
    await createKairosRepositories(db).savedAnalyses.put(current);
    const incoming: SavedAnalysis = defineSavedAnalysis({ ...saved, id: 'incoming-analysis' });
    const prepared = await prepareKairosRestore(db, serializeKairosBackup(createKairosBackupEnvelope({ metadata: [], savedAnalyses: [incoming] })));
    const result = await replaceKairosDatabaseFromPreparedRestore(db, prepared);
    expect(result.restoredSavedAnalysisRecords).toBe(1);
    expect(await db.savedAnalyses.toArray()).toEqual([incoming]);
    db.close();
  });
});
