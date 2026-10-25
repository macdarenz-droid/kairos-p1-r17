import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { saveTradeDiscipline } from '../src/application/discipline';
import { saveStrategy } from '../src/application/discipline/strategies';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { KAIROS_DEFAULT_DISCIPLINE_LISTS, type DisciplineListItemId, type TradeDisciplineRecord } from '../src/domain/discipline';
import type { TradeId } from '../src/domain/trades';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-save-with-discipline-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db); return db;
}
const now = () => '2026-10-24T09:00:00.000Z';
const [first, second] = KAIROS_DEFAULT_DISCIPLINE_LISTS.checklist;
const planned: SaveManualTradeInput = {
  symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'draft', grossPnlCurrency: 'USDT',
  plan: { plannedEntryPrice: '100', plannedStopPrice: '95', plannedTargetPrice: '110', plannedQuantity: '1' },
};
const closed: SaveManualTradeInput = {
  ...planned, status: 'closed', openedAt: '2026-10-24T08:00:00.000Z', closedAt: '2026-10-24T08:30:00.000Z',
  executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-10-24T08:00:00.000Z' }, { type: 'exit', price: '104', quantity: '1', executedAt: '2026-10-24T08:30:00.000Z' }],
};
async function strategy(db: KairosDatabase) {
  const saved = await saveStrategy(db, { id: null, name: 'Patient', rules: [{ id: 'wait', kind: 'written', label: 'Wait for the close' }] });
  if (!saved.ok) throw new Error('fixture');
  return saved.strategy;
}
const recordOf = async (db: KairosDatabase, tradeId: TradeId): Promise<TradeDisciplineRecord | undefined> => (await db.tradeDiscipline.where('tradeId').equals(tradeId).toArray())[0];

describe('T-057a a trade and what was ticked before it, in one write', () => {
  it('saves a planned trade with its checklist, strategy ticks and "Before you save" note in one record', async () => {
    const db = await database();
    const chosen = await strategy(db);
    const saved = await saveManualTrade(db, {
      ...planned,
      discipline: {
        checklist: [{ itemId: first!.id, answer: 'yes' }, { itemId: second!.id, answer: 'no' }],
        strategy: { strategyId: chosen.id, answers: [{ itemId: 'wait' as DisciplineListItemId, answer: 'yes' }] },
        beforeSave: { notes: ['no-stop', 'rule-broken'], reason: '  Clear setup, small size.  ' },
      },
    }, { now });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const record = await recordOf(db, saved.tradeId);
    expect(record).toMatchObject({
      tradeId: saved.tradeId, checklistCompletedAt: now(), createdAt: now(), updatedAt: now(),
      preTradeChecklist: [{ itemId: first!.id, label: first!.label, answer: 'yes' }, { itemId: second!.id, label: second!.label, answer: 'no' }],
      strategy: { strategyId: chosen.id, name: 'Patient', answers: [{ ruleId: 'wait', answer: 'yes' }], linkedAt: now() },
      beforeSave: { notes: ['no-stop', 'rule-broken'], reason: 'Clear setup, small size.', at: now() },
    });
    // The strategy copy is the one saveTradeDiscipline makes for a card.
    const other = await saveManualTrade(db, planned, { now });
    if (!other.ok) throw new Error('fixture');
    await saveTradeDiscipline(db, { tradeId: other.tradeId, scope: 'real', half: 'strategy', strategyId: chosen.id, answers: [{ itemId: 'wait' as DisciplineListItemId, answer: 'yes' }] }, { now });
    expect((await recordOf(db, other.tradeId))?.strategy).toEqual(record?.strategy);
    // Parts that say nothing write no record.
    const quiet = await savePracticeTrade(db, { ...planned, discipline: { checklist: [], strategy: { strategyId: null, answers: [] }, beforeSave: { notes: [], reason: null } } });
    if (!quiet.ok) throw new Error('fixture');
    expect(await recordOf(db, quiet.tradeId)).toBeUndefined();
  });

  it('saves nothing when a part is refused, and names the part', async () => {
    const db = await database();
    expect(await saveManualTrade(db, { ...planned, discipline: { checklist: [{ itemId: 'not-a-step' as DisciplineListItemId, answer: 'yes' }] } }))
      .toEqual({ ok: false, type: 'validation-error', field: 'discipline.checklist', reason: 'unknown-item' });
    expect(await saveManualTrade(db, { ...planned, discipline: { strategy: { strategyId: 'gone' as never, answers: [] } } }))
      .toEqual({ ok: false, type: 'validation-error', field: 'discipline.strategy', reason: 'strategy-not-found' });
    expect(await saveManualTrade(db, { ...planned, discipline: { beforeSave: { notes: ['no-stop'], reason: 'x'.repeat(201) } } }))
      .toEqual({ ok: false, type: 'validation-error', field: 'discipline.beforeSave', reason: 'invalid-before-save' });
    expect(await db.trades.count()).toBe(0);
    expect(await db.tradePlans.count()).toBe(0);
    expect(await db.tradeDiscipline.count()).toBe(0);
  });

  it('a closed trade logged after the fact gets no checklist; a replay trade, ticked at its plan step, keeps it', async () => {
    const db = await database();
    const checklist = [{ itemId: first!.id, answer: 'yes' as const }];
    expect(await saveManualTrade(db, { ...closed, discipline: { checklist } }))
      .toEqual({ ok: false, type: 'validation-error', field: 'discipline.checklist', reason: 'trade-status-not-allowed' });
    expect(await savePracticeTrade(db, { ...closed, discipline: { checklist } }))
      .toEqual({ ok: false, type: 'validation-error', field: 'discipline.checklist', reason: 'trade-status-not-allowed' });
    expect(await db.trades.count()).toBe(0);
    const replay = await savePracticeTrade(db, { ...closed, source: 'replay', discipline: { checklist } }, { now });
    if (!replay.ok) throw new Error(JSON.stringify(replay));
    expect(await recordOf(db, replay.tradeId)).toMatchObject({ preTradeChecklist: [{ itemId: first!.id, answer: 'yes' }], checklistCompletedAt: now() });
    // A closed trade may still name its strategy in the same write.
    const chosen = await strategy(db);
    const named = await saveManualTrade(db, { ...closed, discipline: { strategy: { strategyId: chosen.id, answers: [] } } });
    if (!named.ok) throw new Error('fixture');
    expect((await recordOf(db, named.tradeId))?.strategy?.strategyId).toBe(chosen.id);
  });
});
