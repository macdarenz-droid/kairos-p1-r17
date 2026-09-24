import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { loadTradeDisciplineCards, saveTradeDiscipline, summarizeTradeChecklist } from '../src/application/discipline';
import { createKairosDatabase, openKairosDatabase, runKairosAtomicWrite, type KairosDatabase } from '../src/data/database';
import { KAIROS_DEFAULT_DISCIPLINE_LISTS, type TradeDisciplineId, type TradeDisciplineRecord } from '../src/domain/discipline';
import type { TradeId, TradeRecord } from '../src/domain/trades';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-discipline-summary-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

const at = '2026-09-24T10:00:00.000Z';
const answers = (yes: number, total: number) => KAIROS_DEFAULT_DISCIPLINE_LISTS.checklist.slice(0, total).map((item, index) => ({ itemId: item.id, label: item.label, answer: index < yes ? 'yes' as const : 'no' as const }));
const record = (overrides: Partial<TradeDisciplineRecord> = {}): TradeDisciplineRecord => ({
  id: 'd-1' as TradeDisciplineId, tradeId: 't-1' as TradeId, preTradeChecklist: answers(2, 5), postTradeReview: [], mistakes: [], note: '',
  checklistCompletedAt: at, reviewedAt: null, createdAt: at, updatedAt: at, ...overrides,
});
const openTrade = (id: string): TradeRecord => ({ id: id as TradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'open', source: 'manual', openedAt: at, closedAt: null, createdAt: at, updatedAt: at } as TradeRecord);

describe('P22.3 checklist summary', () => {
  it('owns the checklist counts of one trade', () => {
    expect(summarizeTradeChecklist(null)).toBeNull();
    expect(summarizeTradeChecklist(record({ checklistCompletedAt: null }))).toBeNull();
    expect(summarizeTradeChecklist(record({ preTradeChecklist: [] }))).toBeNull();
    expect(summarizeTradeChecklist(record())).toEqual({ ticked: 2, asked: 5, complete: false });
    expect(summarizeTradeChecklist(record({ preTradeChecklist: answers(5, 5) }))).toEqual({ ticked: 5, asked: 5, complete: true });
  });

  it('reads the lists and the saved records of a page in one batch', async () => {
    const db = await database();
    await runKairosAtomicWrite(db, ['trades'], async ({ repositories }) => { for (const id of ['a', 'b', 'c']) await repositories.trades.put(openTrade(id)); });
    const saved = await saveTradeDiscipline(db, { tradeId: 'b' as TradeId, scope: 'real', half: 'checklist', answers: [{ itemId: 'plan-written', answer: 'yes' }] });
    if (!saved.ok) throw new Error(saved.reason);
    const cards = await loadTradeDisciplineCards(db, ['a', 'b', 'c']);
    expect([...cards.records.keys()]).toEqual(['b']);
    expect(cards.records.get('b')).toEqual(saved.record);
    expect(cards.lists).toEqual(KAIROS_DEFAULT_DISCIPLINE_LISTS);
    const empty = await loadTradeDisciplineCards(db, []);
    expect(empty.records.size).toBe(0);
    expect(empty.lists).toEqual(KAIROS_DEFAULT_DISCIPLINE_LISTS);
  });
});
