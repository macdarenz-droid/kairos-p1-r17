import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSavedAnalysis } from '../src/application/saved-analysis';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const names: string[] = [];
const dbName = (label: string) => {
  const name = `kairos-p20-4-${label}-${crypto.randomUUID()}`;
  names.push(name);
  return name;
};

afterEach(async () => {
  for (const name of names.splice(0)) await Dexie.delete(name);
});

const saved = Object.freeze({
  id: 'analysis-1',
  market: Object.freeze({ venue: 'BINANCE', instrument: 'BTCUSDT', source: 'market-reference' as const }),
  drawings: Object.freeze([]),
  riskRewards: Object.freeze([]),
});

describe('P20.4 Saved Analysis application load orchestration', () => {
  it('loads one Saved Analysis by its canonical stable id', async () => {
    const db = createKairosDatabase(dbName('load'));
    await openKairosDatabase(db);
    await createKairosRepositories(db).savedAnalyses.put(saved);

    const result = await loadSavedAnalysis(db, saved.id);

    expect(result).toEqual({ ok: true, savedAnalysis: saved });
    if (result.ok) expect(result.savedAnalysis).not.toBe(saved);
    db.close();
  });

  it('returns an explicit not-found result when the id has no record', async () => {
    const db = createKairosDatabase(dbName('missing'));
    await openKairosDatabase(db);

    expect(await loadSavedAnalysis(db, 'missing-analysis')).toEqual({
      ok: false,
      type: 'not-found',
      reason: 'saved-analysis-not-found',
    });
    db.close();
  });

  it('returns an explicit storage error when repository access fails', async () => {
    const db = createKairosDatabase(dbName('failure'));
    await openKairosDatabase(db);
    db.close();

    const result = await loadSavedAnalysis(db, saved.id);
    expect(result).toEqual({
      ok: false,
      type: 'storage-error',
      reason: 'saved-analysis-load-failed',
    });
  });
});
