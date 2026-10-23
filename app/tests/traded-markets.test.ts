import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitBackupRestore, commitTradeImport, exportKairosBackup, prepareBackupRestore, prepareTradeImport } from '../src/application/backup';
import { loadTradedMarkets, parseTradedMarkets, saveTradedMarkets, tradedMarketsMetadataKey } from '../src/application/setup/tradedMarkets';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(label: string): Promise<KairosDatabase> {
  const name = `kairos-traded-markets-${label}-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  return db;
}
const now = () => '2026-10-23T10:00:00.000Z';

describe('T-053d the markets you trade', () => {
  it('keeps at least one known market, each once, crypto first', () => {
    expect(parseTradedMarkets(['stock', 'forex', 'forex'])).toEqual({ ok: true, markets: ['forex', 'stock'] });
    expect(parseTradedMarkets(['other', 'crypto'])).toEqual({ ok: true, markets: ['crypto', 'other'] });
    expect(parseTradedMarkets([])).toEqual({ ok: false, reason: 'none-chosen' });
    expect(parseTradedMarkets(['bonds'])).toEqual({ ok: false, reason: 'unknown-market' });
  });

  it('saves them, reads none as null and a damaged record as null', async () => {
    const db = await database('save');
    expect(await loadTradedMarkets(db)).toBeNull();
    expect(await saveTradedMarkets(db, ['forex'], { now })).toEqual({ ok: true, markets: ['forex'] });
    expect(JSON.parse((await db.metadata.get(tradedMarketsMetadataKey))!.value)).toEqual({ version: 1, markets: ['forex'] });
    expect(await loadTradedMarkets(db)).toEqual(['forex']);
    expect(await saveTradedMarkets(db, [], { now })).toEqual({ ok: false, type: 'validation-error', reason: 'none-chosen' });
    expect(await loadTradedMarkets(db)).toEqual(['forex']);
    for (const value of ['nope', '{"version":1,"markets":[]}', '{"version":1,"markets":["forex","forex"]}', '{"version":1,"markets":["stock","forex"]}', '{"version":1,"markets":["bonds"]}', '{"version":2,"markets":["forex"]}']) {
      await db.metadata.put({ key: tradedMarketsMetadataKey, value, updatedAt: now() });
      expect(await loadTradedMarkets(db), value).toBeNull();
    }
  });

  it('reports a storage failure, and travels in a full restore', async () => {
    const failing = await database('failure');
    vi.spyOn(failing, 'transaction').mockRejectedValue(new Error('quota'));
    expect(await saveTradedMarkets(failing, ['crypto'], { now })).toEqual({ ok: false, type: 'storage-error', reason: 'traded-markets-save-failed' });
    vi.restoreAllMocks();
    const source = await database('source');
    await saveTradedMarkets(source, ['stock', 'crypto'], { now });
    const exported = await exportKairosBackup(source, new Date(now()));
    if (!exported.ok) throw new Error('export failed');
    const target = await database('target');
    const prepared = await prepareBackupRestore(target, exported.file.contents);
    if (!prepared.ok) throw new Error('prepare failed');
    expect((await commitBackupRestore(target, prepared.restore)).ok).toBe(true);
    expect(await loadTradedMarkets(target)).toEqual(['crypto', 'stock']);
  });

  it('T-053d fix r1: a merge import (trades only) leaves it alone', async () => {
    const target = await database('merge-target');
    await saveTradedMarkets(target, ['forex'], { now });
    const other = await database('merge-other');
    await saveTradedMarkets(other, ['crypto', 'stock'], { now });
    await saveManualTrade(other, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt: '2026-10-20T08:00:00.000Z' });
    const backup = await exportKairosBackup(other, new Date(now()));
    if (!backup.ok) throw new Error('export failed');
    const importing = await prepareTradeImport(target, backup.file.contents);
    if (!importing.ok) throw new Error('import prepare failed');
    expect((await commitTradeImport(target, importing.import)).ok).toBe(true);
    expect(await loadTradedMarkets(target)).toEqual(['forex']);
  });
});
