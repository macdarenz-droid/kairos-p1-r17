import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveSavedAnalysis } from '../src/application/saved-analysis';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';

const names: string[] = [];
const dbName = (label: string) => {
  const name = `kairos-p20-3-${label}-${crypto.randomUUID()}`;
  names.push(name);
  return name;
};

afterEach(async () => {
  vi.restoreAllMocks();
  for (const name of names.splice(0)) await Dexie.delete(name);
});

const input = Object.freeze({
  market: Object.freeze({ venue: 'BINANCE', instrument: 'BTCUSDT', source: 'market-reference' as const }),
  drawings: Object.freeze([]),
  riskRewards: Object.freeze([]),
});

describe('P20.3 Saved Analysis application save orchestration', () => {
  it('allocates a fresh Saved Analysis id and persists exactly one logical analysis', async () => {
    const db = createKairosDatabase(dbName('save'));
    await openKairosDatabase(db);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');

    const result = await saveSavedAnalysis(db, input);

    expect(result).toEqual({ ok: true, savedAnalysisId: '11111111-1111-4111-8111-111111111111' });
    expect(await db.savedAnalyses.toArray()).toEqual([{
      id: '11111111-1111-4111-8111-111111111111',
      market: input.market,
      drawings: [],
      riskRewards: [],
    }]);
    db.close();
  });

  it('returns an explicit storage error and leaves no Saved Analysis record on write failure', async () => {
    const db = createKairosDatabase(dbName('failure'));
    await openKairosDatabase(db);
    db.savedAnalyses.hook('creating', () => { throw new Error('synthetic-write-failure'); });

    const result = await saveSavedAnalysis(db, input);

    expect(result).toEqual({
      ok: false,
      type: 'storage-error',
      reason: 'saved-analysis-save-failed',
    });
    expect(await db.savedAnalyses.count()).toBe(0);
    db.close();
  });

  it('does not mutate the caller-owned logical input while persisting it', async () => {
    const db = createKairosDatabase(dbName('clone'));
    await openKairosDatabase(db);

    const result = await saveSavedAnalysis(db, input);
    expect(result.ok).toBe(true);

    const [stored] = await db.savedAnalyses.toArray();
    expect(stored.market).toEqual(input.market);
    expect(stored.market).not.toBe(input.market);
    expect(input).toEqual({
      market: { venue: 'BINANCE', instrument: 'BTCUSDT', source: 'market-reference' },
      drawings: [],
      riskRewards: [],
    });
    db.close();
  });
});
