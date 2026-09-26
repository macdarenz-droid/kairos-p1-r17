import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { defineSavedAnalysis } from '../src/domain/saved-records/savedAnalysisContract';
import { defineSavedTimeAssistedSnapshot } from '../src/domain/saved-records/savedTimeAssistedSnapshotContract';
import { buildSavedRecordIndex, filterSavedRecordIndex, listSavedRecordIndex } from '../src/application/library';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const names: string[] = [];
const dbName = (label: string) => { const name = `kairos-p27-1-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

const eth = { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' } as const;
const btc = { venue: 'binance-spot', instrument: 'BTCUSDT', source: 'market-reference' } as const;
const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const analysis = (id: string, market: typeof eth | typeof btc, label?: string) => defineSavedAnalysis({ id, market, drawings: [{ id: `${id}-d`, kind: 'trend-line', start: { timestamp: '2026-09-10T02:00:00.000Z', price: '2100' as never }, end: { timestamp: '2026-09-10T03:00:00.000Z', price: '2300' as never } }], riskRewards: [], ...(label === undefined ? {} : { label }) });
const snapshot = (id: string, market: typeof eth | typeof btc, savedAt: string, label?: string) => defineSavedTimeAssistedSnapshot({ id, market, side: 'short', openedAt: '2026-09-10T02:13:27Z', openedAtUtc: '2026-09-10T02:13:27.000Z', closedAt: null, closedAtUtc: null, inputTimeZone: 'UTC', opening: { kind: 'unavailable', instrument, requestedAt: '2026-09-10T02:13:27Z', reason: 'no-candle' }, closing: null, durationMs: null, savedAt, isEstimate: true, source: 'market-reference', ...(label === undefined ? {} : { label }) });

describe('P27.1 cross-market saved-record index', () => {
  it('lists snapshots newest first, then analyses by label then id, with labels, markets and the facts each contract carries', () => {
    const index = buildSavedRecordIndex([analysis('a-zed', eth, 'Zed plan'), analysis('a-plain', btc), analysis('a-alpha', eth, 'Alpha plan')], [snapshot('s-old', btc, '2026-09-17T03:30:00.000Z', 'Old scalp'), snapshot('s-new', eth, '2026-09-18T03:30:00.000Z')]);
    expect(index.entries.map(entry => `${entry.kind}:${entry.id}`)).toEqual(['snapshot:s-new', 'snapshot:s-old', 'analysis:a-alpha', 'analysis:a-zed', 'analysis:a-plain']);
    expect(index.entries[0]).toEqual({ kind: 'snapshot', id: 's-new', market: eth, label: null, side: 'short', openedAtUtc: '2026-09-10T02:13:27.000Z', closedAtUtc: null, savedAt: '2026-09-18T03:30:00.000Z' });
    expect(index.entries[2]).toEqual({ kind: 'analysis', id: 'a-alpha', market: eth, label: 'Alpha plan', drawingCount: 1, riskRewardCount: 0, savedAt: null });
    expect(index.markets).toEqual([btc, eth]);
    expect(index.counts).toEqual({ analyses: 3, snapshots: 2 });
    expect(Object.isFrozen(index.entries)).toBe(true);
  });

  it('filters by kind and by exact market without re-ordering', () => {
    const index = buildSavedRecordIndex([analysis('a1', eth), analysis('a2', btc)], [snapshot('s1', eth, '2026-09-18T03:30:00.000Z')]);
    expect(filterSavedRecordIndex(index, { kind: 'analysis' }).map(entry => entry.id)).toEqual(['a1', 'a2']);
    expect(filterSavedRecordIndex(index, { market: { venue: 'binance-spot', instrument: 'ETHUSDT' } }).map(entry => entry.id)).toEqual(['s1', 'a1']);
    expect(filterSavedRecordIndex(index, { kind: 'snapshot', market: { venue: 'binance-spot', instrument: 'BTCUSDT' } })).toEqual([]);
    expect(filterSavedRecordIndex(index, {})).toEqual(index.entries);
  });

  it('reads both released listings from the database and writes nothing', async () => {
    const db = createKairosDatabase(dbName('db'));
    await openKairosDatabase(db);
    const repos = createKairosRepositories(db);
    expect(await listSavedRecordIndex(db)).toEqual({ entries: [], markets: [], counts: { analyses: 0, snapshots: 0 } });
    await repos.savedAnalyses.put(analysis('a1', eth, 'Plan'));
    await repos.savedTimeAssistedSnapshots.put(snapshot('s1', btc, '2026-09-18T03:30:00.000Z'));
    const index = await listSavedRecordIndex(db);
    expect(index.entries.map(entry => entry.id)).toEqual(['s1', 'a1']);
    expect(index.markets).toEqual([btc, eth]);
    expect(await db.savedAnalyses.count()).toBe(1);
    expect(await db.savedTimeAssistedSnapshots.count()).toBe(1);
    db.close();
  });
});
