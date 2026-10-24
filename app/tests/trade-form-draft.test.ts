import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { commitBackupRestore, prepareBackupRestore } from '../src/application/backup';
import { clearTradeFormDraft, keepTradeFormDraft, readTradeFormDraft, tradeFormDraftKey, type TradeFormDraft } from '../src/application/trades/tradeFormDraft';
import { createEmptyManualTradeDraft } from '../src/application/trades';
import { createKairosDatabaseSnapshot, serializeKairosBackup } from '../src/data/backup';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-trade-form-draft-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  return db;
}
const now = () => '2026-10-24T10:00:00.000Z';
const typed: TradeFormDraft = {
  trade: { ...createEmptyManualTradeDraft(), symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', openedAt: '2026-10-24T09:00', priceCurrency: 'USDT', plan: { plannedEntryPrice: '', plannedStopPrice: '64000', plannedTargetPrice: '', plannedQuantity: '', reason: 'Breakout' } },
  quick: { entryPrice: '65000', exitPrice: '', quantity: '0.1' },
  executions: [{ key: 'e1', type: 'entry', price: '65000', quantity: '0.1', executedAt: '2026-10-24T09:00' }],
  fees: [{ key: 'f1', amount: '1.2', currency: 'USDT' }],
};

describe('T-059e the trade you were typing, kept on this device', () => {
  it('keeps, reads and clears it, and an empty form keeps nothing', async () => {
    const db = await database();
    expect(await readTradeFormDraft(db, 'journal')).toBeNull();
    expect(await keepTradeFormDraft(db, 'journal', { mode: 'quick', draft: typed }, { now })).toBe(true);
    expect(await readTradeFormDraft(db, 'journal')).toEqual({ savedAt: now(), mode: 'quick', draft: typed });
    expect(await clearTradeFormDraft(db, 'journal')).toBe(true);
    expect(await readTradeFormDraft(db, 'journal')).toBeNull();
    // The market alone is not a trade being typed: the form fills it with the first market you trade.
    const blank: TradeFormDraft = { trade: { ...createEmptyManualTradeDraft(), marketType: 'crypto' }, quick: { entryPrice: ' ', exitPrice: '', quantity: '' }, executions: [], fees: [] };
    await keepTradeFormDraft(db, 'journal', { mode: 'full', draft: typed }, { now });
    expect(await keepTradeFormDraft(db, 'journal', { mode: 'full', draft: blank }, { now })).toBe(true);
    expect(await db.metadata.get(tradeFormDraftKey('journal'))).toBeUndefined();
  });

  it('drops a damaged record instead of using part of it', async () => {
    const db = await database();
    const key = tradeFormDraftKey('journal');
    const good = { version: 1, savedAt: now(), mode: 'full', draft: typed };
    const damaged = [
      'not json',
      JSON.stringify({ ...good, version: 2 }),
      JSON.stringify({ ...good, mode: 'other' }),
      JSON.stringify({ ...good, savedAt: 'yesterday' }),
      JSON.stringify({ ...good, draft: { ...typed, trade: { ...typed.trade, side: 'sideways' } } }),
      JSON.stringify({ ...good, draft: { ...typed, trade: { ...typed.trade, symbol: 42 } } }),
      JSON.stringify({ ...good, draft: { ...typed, quick: { ...typed.quick, extra: '1' } } }),
      JSON.stringify({ ...good, draft: { ...typed, executions: [{ ...typed.executions[0], type: 'fill' }] } }),
      JSON.stringify({ ...good, draft: { ...typed, fees: {} } }),
      JSON.stringify({ ...good, draft: { ...typed, trade: { ...typed.trade, plan: { plannedEntryPrice: '' } } } }),
      JSON.stringify({ ...good, script: 'x' }),
    ];
    for (const value of damaged) {
      await db.metadata.put({ key, value, updatedAt: now() });
      expect(await readTradeFormDraft(db, 'journal'), value).toBeNull();
      expect(await db.metadata.get(key), value).toBeUndefined();
    }
  });

  it('is never in a backup, and a restore keeps it', async () => {
    const db = await database();
    const older = serializeKairosBackup(await createKairosDatabaseSnapshot(db));
    await keepTradeFormDraft(db, 'journal', { mode: 'quick', draft: typed }, { now });
    expect(tradeFormDraftKey('journal').startsWith('device.')).toBe(true);
    expect((await createKairosDatabaseSnapshot(db)).payload.metadata.map(row => row.key)).not.toContain(tradeFormDraftKey('journal'));
    const prepared = await prepareBackupRestore(db, older);
    if (!prepared.ok) throw new Error(prepared.type);
    expect((await commitBackupRestore(db, prepared.restore)).ok).toBe(true);
    expect((await readTradeFormDraft(db, 'journal'))?.draft).toEqual(typed);
  });

  it('keeps Journal and Practice apart', async () => {
    const db = await database();
    const practice: TradeFormDraft = { ...typed, trade: { ...typed.trade, symbol: 'ETHUSDT' } };
    await keepTradeFormDraft(db, 'journal', { mode: 'quick', draft: typed }, { now });
    await keepTradeFormDraft(db, 'practice', { mode: 'full', draft: practice }, { now });
    expect((await readTradeFormDraft(db, 'journal'))?.draft.trade.symbol).toBe('BTCUSDT');
    expect((await readTradeFormDraft(db, 'practice'))?.mode).toBe('full');
    await clearTradeFormDraft(db, 'journal');
    expect((await readTradeFormDraft(db, 'practice'))?.draft).toEqual(practice);
  });
});
