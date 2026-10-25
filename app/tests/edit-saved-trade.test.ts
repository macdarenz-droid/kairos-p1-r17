import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveTradeDiscipline } from '../src/application/discipline';
import { saveStrategy } from '../src/application/discipline/strategies';
import { getJournalHistoryEntry, type JournalHistoryEntry } from '../src/application/journal';
import { savePracticeTrade } from '../src/application/practice';
import {
  editableTradeDraft, editSavedTrade, localDateTimeInputValue, saveManualTrade, tradeRevision, updateTradeExecution,
  type EditableTradeDraft, type EditSavedTradeInput, type SaveManualTradeInput,
} from '../src/application/trades';
import { latestTradePlan } from '../src/application/trade-visualizer/tradeVisualizerFacts';
import { createKairosDatabase, type KairosDatabase } from '../src/data/database';
import { KAIROS_DEFAULT_DISCIPLINE_LISTS, type DisciplineListItemId } from '../src/domain/discipline';
import type { TradeExecutionId, TradeFeeId, TradeId, TradePlanId } from '../src/domain/trades';

let db: KairosDatabase;
// One source of new ids for every edit in a test, as the real ones are never used twice.
let editIds = ids('edit');
afterEach(async () => { vi.restoreAllMocks(); if (db) { db.close(); await db.delete(); } });

// The clock moves on between a save and each edit: the newest plan is the one with the latest saved time.
const savedAt = '2026-09-20T10:00:00.000Z';
const editedAt = '2026-09-20T10:05:00.000Z';
const editedAgainAt = '2026-09-20T10:10:00.000Z';
const editedThirdAt = '2026-09-20T10:15:00.000Z';
const opened = '2026-09-20T09:00:00.123Z';
const closed = '2026-09-20T09:45:30.250Z';

function ids(prefix: string) {
  let index = 0;
  return <T extends TradeId | TradePlanId | TradeExecutionId | TradeFeeId>() => `${prefix}-${++index}` as T;
}
const closedTrade: SaveManualTradeInput = {
  symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: opened, closedAt: closed,
  exchange: 'Kraken', tags: ['breakout'], leverage: '2',
  plan: { plannedEntryPrice: '100', plannedStopPrice: '95', plannedTargetPrice: '110', plannedQuantity: '1', reason: 'Clean break' },
  executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: opened }, { type: 'exit', price: '108', quantity: '1', executedAt: closed }],
  fees: [{ amount: '0.5', currency: 'USDT' }],
};

async function open(): Promise<void> {
  db = createKairosDatabase('edit-saved-trade-' + crypto.randomUUID());
  await db.open();
  editIds = ids('edit');
}
/** Saves a trade at `savedAt` and reads it as the Journal does. */
async function start(input: SaveManualTradeInput = closedTrade): Promise<JournalHistoryEntry> {
  await open();
  const saved = await saveManualTrade(db, input, { now: () => savedAt, createId: ids('save') });
  if (!saved.ok) throw new Error('fixture: ' + JSON.stringify(saved));
  return read(saved.tradeId);
}
const read = async (id: TradeId | string): Promise<JournalHistoryEntry> => (await getJournalHistoryEntry(db, id))!;
async function facts() {
  return {
    trades: await db.trades.toArray(), plans: await db.tradePlans.toArray(), executions: await db.tradeExecutions.toArray(),
    fees: await db.tradeFees.toArray(), discipline: await db.tradeDiscipline.toArray(),
  };
}
/** The form as Edit fills it from the saved trade, with the changes the trader makes, and the revision it was opened at. */
function formFor(entry: JournalHistoryEntry, change: Partial<EditableTradeDraft> = {}, extra: Partial<EditSavedTradeInput> = {}): EditSavedTradeInput {
  const form = { ...editableTradeDraft(entry), ...change };
  return { tradeId: entry.trade.id, expectedRevision: tradeRevision(entry), draft: form.draft, executions: form.executions, fees: form.fees, note: form.note, scope: 'real', ...extra };
}
/** Only the draft's fields change. */
const withDraft = (entry: JournalHistoryEntry, change: Partial<EditableTradeDraft['draft']>, extra: Partial<EditSavedTradeInput> = {}) =>
  formFor(entry, { draft: { ...editableTradeDraft(entry).draft, ...change } }, extra);
const withPlan = (entry: JournalHistoryEntry, plan: Partial<EditableTradeDraft['draft']['plan']>, extra: Partial<EditSavedTradeInput> = {}) =>
  withDraft(entry, { plan: { ...editableTradeDraft(entry).draft.plan, ...plan } }, extra);
const edit = (input: EditSavedTradeInput, now = editedAt) => editSavedTrade(db, input, { now: () => now, createId: editIds });
const entryRow = (entry: JournalHistoryEntry) => entry.executions.find(row => row.type === 'entry')!;
const exitRow = (entry: JournalHistoryEntry) => entry.executions.find(row => row.type === 'exit')!;

describe('editSavedTrade changes a saved trade in one write', () => {
  it('changes every field of the trade and keeps its id, created time and source', async () => {
    const before = await start();
    const form = editableTradeDraft(before);
    const newOpenedAt = '2026-09-20T07:30:00.000Z';
    const newExitAt = '2026-09-20T09:50:00.000Z';
    const result = await edit(formFor(before, {
      draft: {
        ...form.draft, symbol: ' ethusdt ', marketType: 'other', side: 'short', openedAt: localDateTimeInputValue(newOpenedAt), exchange: 'Binance',
        tags: 'swing, news', leverage: '5', plan: { ...form.draft.plan, plannedStopPrice: '97' },
      },
      executions: [
        ...form.executions.map(row => (row.key === entryRow(before).id ? { ...row, price: '101' } : { ...row, quantity: '0.5' })),
        { key: 'new-exit-row', type: 'exit', price: '110', quantity: '0.5', executedAt: localDateTimeInputValue(newExitAt) },
      ],
      fees: form.fees.map(row => ({ ...row, amount: '0.8' })),
    }));
    expect(result).toEqual({ ok: true, tradeId: before.trade.id, planChanged: true });

    const after = await read(before.trade.id);
    // The trade: the changed values are saved; the identity is kept; the updated time is the edit's.
    expect(after.trade).toEqual({
      ...before.trade, symbol: 'ETHUSDT', marketType: 'other', side: 'short', openedAt: newOpenedAt, exchange: 'Binance', tags: ['swing', 'news'], leverage: '5', updatedAt: editedAt,
      // The Journal's sort time follows the opened time.
      journalAt: newOpenedAt,
    });
    expect(after.trade.id).toBe(before.trade.id);
    expect(after.trade.createdAt).toBe(savedAt);
    expect(after.trade.source).toBe('manual');
    // Rows that came back keep their ids and created times; the new row has an id of its own.
    expect(after.executions).toHaveLength(3);
    expect(after.executions.find(row => row.id === entryRow(before).id)).toEqual({ ...entryRow(before), price: '101' });
    expect(after.executions.find(row => row.id === exitRow(before).id)).toEqual({ ...exitRow(before), quantity: '0.5' });
    const added = after.executions.filter(row => !before.executions.some(saved => saved.id === row.id));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ tradeId: before.trade.id, type: 'exit', price: '110', quantity: '0.5', executedAt: newExitAt, createdAt: editedAt });
    expect(after.fees).toEqual([{ ...before.fees[0], amount: '0.8' }]);
    // The plan: the old version stays and the new one is the latest.
    expect(after.plans).toHaveLength(2);
    expect(after.plans.find(plan => plan.id === before.plans[0]!.id)).toEqual(before.plans[0]);
    expect(latestTradePlan(after.plans)).toMatchObject({
      tradeId: before.trade.id, plannedEntryPrice: '100', plannedStopPrice: '97', plannedTargetPrice: '110', plannedQuantity: '1', reason: 'Clean break', createdAt: editedAt, updatedAt: editedAt,
    });
    expect(latestTradePlan(after.plans)!.id).not.toBe(before.plans[0]!.id);
  });

  it('fills the form from the saved trade, so an edit that changes nothing keeps every fact', async () => {
    const before = await start(); const saved = await facts();
    const form = editableTradeDraft(before);
    expect(form.draft).toMatchObject({
      symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', priceCurrency: 'USDT', exchange: 'Kraken', leverage: '2', tags: 'breakout',
      plan: { plannedEntryPrice: '100', plannedStopPrice: '95', plannedTargetPrice: '110', plannedQuantity: '1', reason: 'Clean break' },
    });
    expect(form.executions.map(row => row.key).sort()).toEqual(before.executions.map(row => row.id as string).sort());
    expect(form.fees.map(row => row.key)).toEqual([before.fees[0]!.id]);
    expect(await edit(formFor(before))).toEqual({ ok: true, tradeId: before.trade.id, planChanged: false });
    const after = await facts();
    expect(after.plans).toEqual(saved.plans);
    expect(after.executions).toEqual(saved.executions);
    expect(after.fees).toEqual(saved.fees);
    expect(after.trades).toEqual([{ ...saved.trades[0], updatedAt: editedAt }]);
  });

  it('removes a row the form no longer has, and a fee tied to a removed exit stays as an untied fee', async () => {
    const before = await start();
    const exit = exitRow(before);
    await db.tradeFees.put({ ...before.fees[0]!, executionId: exit.id });
    const tied = await read(before.trade.id);
    const form = editableTradeDraft(tied);

    // The exit stays: the fee stays tied to it.
    expect((await edit(formFor(tied))).ok).toBe(true);
    expect((await db.tradeFees.toArray())[0]!.executionId).toBe(exit.id);

    // The exit goes: its row is gone, and the fee is not left pointing at a row that no longer exists.
    const again = await read(before.trade.id);
    const result = await edit(formFor(again, { executions: form.executions.filter(row => row.key !== exit.id) }), editedAgainAt);
    expect(result.ok).toBe(true);
    expect((await db.tradeExecutions.toArray()).map(row => row.id)).toEqual([entryRow(before).id]);
    expect(await db.tradeFees.toArray()).toEqual([{ ...before.fees[0], executionId: null }]);
  });

  it('removes a fee row the form no longer has', async () => {
    const before = await start();
    const result = await edit(formFor(before, { fees: [] }));
    expect(result.ok).toBe(true);
    expect(await db.tradeFees.count()).toBe(0);
    expect(await db.tradeExecutions.count()).toBe(2);
    expect((await read(before.trade.id)).fees).toEqual([]);
  });

  it('keeps the checklist, review and strategy record exactly as saved', async () => {
    const chosen = await (async () => {
      await open();
      const saved = await saveStrategy(db, { id: null, name: 'Patient', rules: [{ id: 'wait', kind: 'written', label: 'Wait for the close' }] });
      if (!saved.ok) throw new Error('fixture');
      return saved.strategy;
    })();
    const savedTrade = await saveManualTrade(db, {
      ...closedTrade,
      discipline: {
        strategy: { strategyId: chosen.id, answers: [{ itemId: 'wait' as DisciplineListItemId, answer: 'yes' }] },
        beforeSave: { notes: ['no-stop'], reason: 'Small size' },
      },
    }, { now: () => savedAt, createId: ids('save') });
    if (!savedTrade.ok) throw new Error('fixture: ' + JSON.stringify(savedTrade));
    const [followed] = KAIROS_DEFAULT_DISCIPLINE_LISTS.review;
    const [mistake] = KAIROS_DEFAULT_DISCIPLINE_LISTS.mistakes;
    const reviewed = await saveTradeDiscipline(db, { tradeId: savedTrade.tradeId, scope: 'real', half: 'review', answers: [{ itemId: followed!.id, answer: 'no' }], mistakeIds: [mistake!.id], note: 'Moved the stop' }, { now: () => savedAt });
    expect(reviewed.ok).toBe(true);
    const before = await read(savedTrade.tradeId);
    const record = (await db.tradeDiscipline.toArray())[0]!;
    expect(record).toMatchObject({ tradeId: before.trade.id, strategy: { strategyId: chosen.id }, beforeSave: { notes: ['no-stop'] } });
    expect(record.postTradeReview.length).toBeGreaterThan(0);

    // A real edit: another symbol, another side, a new stop and a note.
    const result = await edit(withDraft(before, { symbol: 'ETHUSDT', side: 'short', plan: { ...editableTradeDraft(before).draft.plan, plannedStopPrice: '97' } }, { note: 'Changed my mind' }));
    expect(result).toMatchObject({ ok: true, planChanged: true });
    expect((await facts()).discipline).toEqual([record]);
  });
});

describe('editSavedTrade and the plan versions', () => {
  it('adds one plan version for a changed stop and keeps the old one', async () => {
    const before = await start();
    expect(await edit(withPlan(before, { plannedStopPrice: '97' }))).toEqual({ ok: true, tradeId: before.trade.id, planChanged: true });
    const after = await read(before.trade.id);
    expect(after.plans).toHaveLength(2);
    expect(after.plans.find(plan => plan.id === before.plans[0]!.id)).toEqual(before.plans[0]);
    expect(latestTradePlan(after.plans)!.plannedStopPrice).toBe('97');
    expect(before.plans[0]!.plannedStopPrice).toBe('95');
  });

  it('adds no plan version when the plan is saved unchanged, even if other things change', async () => {
    const before = await start();
    expect(await edit(withDraft(before, { exchange: 'Binance', leverage: '4' }))).toEqual({ ok: true, tradeId: before.trade.id, planChanged: false });
    const after = await read(before.trade.id);
    expect(after.plans).toEqual(before.plans);
    expect(after.trade.exchange).toBe('Binance');
    // Spaces around a price are not a change.
    expect(await edit(withPlan(after, { plannedStopPrice: ' 95 ' }), editedAgainAt)).toEqual({ ok: true, tradeId: before.trade.id, planChanged: false });
    expect(await db.tradePlans.count()).toBe(1);
  });

  it('adds a version when only "Why I\'m taking it" changes, and when it is cleared', async () => {
    const before = await start();
    expect((await edit(withPlan(before, { reason: 'Retest held' }))).ok).toBe(true);
    const second = await read(before.trade.id);
    expect(latestTradePlan(second.plans)!.reason).toBe('Retest held');
    expect(second.plans).toHaveLength(2);
    expect(await edit(withPlan(second, { reason: '' }), editedAgainAt)).toMatchObject({ ok: true, planChanged: true });
    const third = await read(before.trade.id);
    expect(third.plans).toHaveLength(3);
    expect(Object.hasOwn(latestTradePlan(third.plans)!, 'reason')).toBe(false);
    expect(latestTradePlan(third.plans)).toMatchObject({ plannedEntryPrice: '100', plannedStopPrice: '95', plannedTargetPrice: '110', plannedQuantity: '1' });
  });

  it('adds an all-empty version when every plan field is cleared, and none when it is cleared again', async () => {
    const before = await start();
    const empty = { plannedEntryPrice: '', plannedStopPrice: '', plannedTargetPrice: '', plannedQuantity: '', reason: '' };
    expect(await edit(withPlan(before, empty))).toEqual({ ok: true, tradeId: before.trade.id, planChanged: true });
    const cleared = await read(before.trade.id);
    expect(cleared.plans).toHaveLength(2);
    expect(latestTradePlan(cleared.plans)).toMatchObject({
      tradeId: before.trade.id, plannedEntryPrice: null, plannedStopPrice: null, plannedTargetPrice: null, plannedQuantity: null, createdAt: editedAt, updatedAt: editedAt,
    });
    expect(cleared.plans.find(plan => plan.id === before.plans[0]!.id)).toEqual(before.plans[0]);
    // The empty version is the plan now: saving no plan again says the same, so it adds nothing.
    expect(await edit(withPlan(cleared, empty), editedAgainAt)).toEqual({ ok: true, tradeId: before.trade.id, planChanged: false });
    expect(await db.tradePlans.count()).toBe(2);
    // And a plan typed after that is a new version again.
    expect(await edit(withPlan(await read(before.trade.id), { plannedStopPrice: '94' }), editedThirdAt)).toMatchObject({ ok: true, planChanged: true });
    expect(latestTradePlan((await read(before.trade.id)).plans)!.plannedStopPrice).toBe('94');
    expect(await db.tradePlans.count()).toBe(3);
  });

  it('writes no plan for a trade that never had one, until one is typed', async () => {
    const { plan: _plan, ...unplanned } = closedTrade;
    const before = await start(unplanned);
    expect(before.plans).toEqual([]);
    expect(await edit(formFor(before))).toEqual({ ok: true, tradeId: before.trade.id, planChanged: false });
    expect(await db.tradePlans.count()).toBe(0);
    const form = await read(before.trade.id);
    expect(await edit(withPlan(form, { plannedStopPrice: '95', reason: 'Fresh idea' }), editedAgainAt)).toEqual({ ok: true, tradeId: before.trade.id, planChanged: true });
    expect((await read(before.trade.id)).plans).toHaveLength(1);
    expect(latestTradePlan((await read(before.trade.id)).plans)).toMatchObject({ plannedStopPrice: '95', plannedEntryPrice: null, reason: 'Fresh idea' });
  });

  it('makes a form opened before a plan-only edit stale for the other commands, even at the same moment', async () => {
    const before = await start();
    // Same clock as the save: the trade\'s own saved time does not move, so only the new plan version differs.
    expect((await edit(withPlan(before, { plannedStopPrice: '97' }), savedAt)).ok).toBe(true);
    expect((await read(before.trade.id)).trade.updatedAt).toBe(savedAt);
    const exit = exitRow(before);
    expect(await updateTradeExecution(db, { expected: before, execution: { id: exit.id, price: '109', quantity: exit.quantity, executedAt: exit.executedAt } }, { now: () => editedAgainAt }))
      .toEqual({ ok: false, type: 'update-conflict', reason: 'trade-changed' });
    expect((await db.tradeExecutions.get(exit.id))!.price).toBe('108');
  });
});

describe('editSavedTrade and saved times', () => {
  it('keeps the exact saved text of a time the form still shows unchanged', async () => {
    const before = await start();
    expect(before.trade.openedAt).toBe(opened);
    expect(before.trade.closedAt).toBe(closed);
    const form = editableTradeDraft(before);
    // The form shows minutes (and the seconds when there are any), never the milliseconds.
    expect(form.draft.openedAt).not.toContain('.');
    expect(form.draft.closedAt).not.toContain('.');
    expect(await edit(withDraft(before, { exchange: 'Binance' }))).toMatchObject({ ok: true });
    const after = await read(before.trade.id);
    expect(after.trade.openedAt).toBe(opened);
    expect(after.trade.closedAt).toBe(closed);
    expect(after.executions.map(row => row.executedAt).sort()).toEqual([opened, closed].sort());
    expect(after.trade.exchange).toBe('Binance');
  });

  it('uses the time as typed when the trader changes it, for the trade and for a row', async () => {
    const before = await start();
    const form = editableTradeDraft(before);
    const newOpenedAt = '2026-09-20T08:15:00.000Z';
    const newEntryAt = '2026-09-20T08:20:00.000Z';
    const result = await edit(formFor(before, {
      draft: { ...form.draft, openedAt: localDateTimeInputValue(newOpenedAt) },
      executions: form.executions.map(row => (row.key === entryRow(before).id ? { ...row, executedAt: localDateTimeInputValue(newEntryAt) } : row)),
    }));
    expect(result.ok).toBe(true);
    const after = await read(before.trade.id);
    expect(after.trade.openedAt).toBe(newOpenedAt);
    expect(after.trade.closedAt).toBe(closed);
    expect(after.executions.find(row => row.id === entryRow(before).id)!.executedAt).toBe(newEntryAt);
    expect(after.executions.find(row => row.id === exitRow(before).id)!.executedAt).toBe(closed);
  });

  it('shows saved times in device time and nothing for a time that is not there', async () => {
    const shown = localDateTimeInputValue('2026-09-20T09:00:00.000Z');
    expect(shown).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(new Date(shown).toISOString()).toBe('2026-09-20T09:00:00.000Z');
    expect(localDateTimeInputValue('2026-09-20T09:00:30.000Z')).toMatch(/:30$/);
    expect(localDateTimeInputValue(null)).toBe('');
    expect(localDateTimeInputValue('not a time')).toBe('');
  });
});

describe('editSavedTrade refuses what it must not touch', () => {
  it('refuses a form that is out of date and changes nothing', async () => {
    const before = await start();
    const stale = withDraft(before, { exchange: 'Bybit' });
    expect((await edit(withDraft(before, { exchange: 'Binance' }))).ok).toBe(true);
    const saved = await facts();
    expect(await edit(stale, editedAgainAt)).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-changed' });
    expect(await facts()).toEqual(saved);
    // The same form read again goes through.
    expect((await edit(withDraft(await read(before.trade.id), { exchange: 'Bybit' }), editedAgainAt)).ok).toBe(true);
  });

  it('refuses a form that missed a plan version saved by another tab', async () => {
    const before = await start();
    const stale = withDraft(before, { exchange: 'Bybit' });
    await db.tradePlans.put({ ...before.plans[0]!, id: 'plan-from-the-other-tab' as TradePlanId, plannedStopPrice: '97' as never });
    const saved = await facts();
    expect(await edit(stale)).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-changed' });
    expect(await facts()).toEqual(saved);
  });

  it('refuses a replay trade: its note is the only thing that can change', async () => {
    await open();
    const replay = await savePracticeTrade(db, { ...closedTrade, source: 'replay' }, { now: () => savedAt });
    if (!replay.ok) throw new Error('fixture');
    const entry = await read(replay.tradeId); const saved = await facts();
    expect(await edit(withDraft(entry, { exchange: 'Binance' }, { scope: 'practice' }))).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-not-editable' });
    expect(await facts()).toEqual(saved);
  });

  it('refuses a trade of the other list', async () => {
    const real = await start();
    const paper = await savePracticeTrade(db, { ...closedTrade, symbol: 'ETHUSDT' }, { now: () => savedAt });
    if (!paper.ok) throw new Error('fixture');
    const practice = await read(paper.tradeId); const saved = await facts();
    expect(await edit(withDraft(real, { exchange: 'Binance' }, { scope: 'practice' }))).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-not-editable' });
    expect(await edit(withDraft(practice, { exchange: 'Binance' }, { scope: 'real' }))).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-not-editable' });
    expect(await facts()).toEqual(saved);
  });

  it('edits a paper trade from the practice list and keeps its source', async () => {
    await open();
    const paper = await savePracticeTrade(db, closedTrade, { now: () => savedAt });
    if (!paper.ok) throw new Error('fixture');
    const entry = await read(paper.tradeId);
    expect(entry.trade.source).toBe('paper');
    expect(await edit(withDraft(entry, { symbol: 'SOLUSDT', exchange: 'Binance' }, { scope: 'practice' }))).toEqual({ ok: true, tradeId: paper.tradeId, planChanged: false });
    const after = await read(paper.tradeId);
    expect(after.trade).toMatchObject({ source: 'paper', symbol: 'SOLUSDT', exchange: 'Binance', updatedAt: editedAt, createdAt: savedAt });
  });

  it('says a trade that is not there is missing', async () => {
    const entry = await start(); const saved = await facts();
    expect(await edit(formFor(entry, {}, { tradeId: 'no-such-trade' as TradeId }))).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-missing' });
    expect(await facts()).toEqual(saved);
  });
});

describe('editSavedTrade checks a saved trade like a new one', () => {
  it('asks for the market, the direction and the status', async () => {
    const entry = await start(); const saved = await facts();
    expect(await edit(withDraft(entry, { marketType: '' }))).toEqual({ ok: false, type: 'draft-incomplete', field: 'marketType', reason: 'selection-required' });
    expect(await edit(withDraft(entry, { side: '' }))).toEqual({ ok: false, type: 'draft-incomplete', field: 'side', reason: 'selection-required' });
    expect(await edit(withDraft(entry, { status: '' }))).toEqual({ ok: false, type: 'draft-incomplete', field: 'status', reason: 'selection-required' });
    expect(await facts()).toEqual(saved);
  });

  it('asks for a currency pair when the market is forex', async () => {
    const entry = await start(); const saved = await facts();
    expect(await edit(withDraft(entry, { marketType: 'forex', symbol: 'BTCUSDT' }))).toEqual({ ok: false, type: 'forex-pair', field: 'symbol', reason: 'not-a-pair' });
    expect(await edit(withDraft(entry, { marketType: 'forex', symbol: 'EUREUR' }))).toEqual({ ok: false, type: 'forex-pair', field: 'symbol', reason: 'same-currency' });
    expect(await facts()).toEqual(saved);
  });

  it('gives a closed trade without a closed time the reason a new trade gets', async () => {
    const entry = await start(); const saved = await facts();
    const equivalent = await saveManualTrade(db, { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', openedAt: opened, closedAt: null, grossPnlCurrency: 'USDT' });
    expect(equivalent).toEqual({ ok: false, type: 'validation-error', field: 'trade', reason: 'closed-requires-open-and-close-times' });
    expect(await edit(withDraft(entry, { closedAt: '' }))).toEqual(equivalent);
    expect(await facts()).toEqual(saved);
  });

  it('gives the field and reason a new trade gets for a bad plan price, row or tag', async () => {
    const entry = await start(); const saved = await facts();
    const form = editableTradeDraft(entry);
    const refused = [
      [withPlan(entry, { plannedStopPrice: 'abc' }), 'plan.plannedStopPrice'],
      [withDraft(entry, { exchange: 'x'.repeat(41) }), 'exchange'],
      [withDraft(entry, { leverage: '5000' }), 'leverage'],
      [withDraft(entry, { tags: Array.from({ length: 11 }, (_, index) => `tag${index}`).join(',') }), 'tags'],
      [formFor(entry, { executions: form.executions.map((row, index) => (index === 0 ? { ...row, price: '0' } : row)) }), 'executions.0.price'],
      [formFor(entry, { fees: form.fees.map(row => ({ ...row, currency: '  ' })) }), 'fees.0.currency'],
    ] as const;
    for (const [input, field] of refused) expect(await edit(input)).toMatchObject({ ok: false, type: 'validation-error', field });
    expect(await facts()).toEqual(saved);
  });

  it('refuses a row with no readable time before anything is written', async () => {
    const entry = await start(); const saved = await facts();
    const form = editableTradeDraft(entry);
    const result = await edit(formFor(entry, { draft: { ...form.draft, exchange: 'Binance' }, executions: form.executions.map((row, index) => (index === 0 ? { ...row, executedAt: '' } : row)) }));
    expect(result).toMatchObject({ ok: false, type: 'execution-draft-invalid', field: 'executions.0.executedAt' });
    expect(await facts()).toEqual(saved);
  });

  it('refuses a note of 2,001 characters and names the note', async () => {
    const entry = await start(); const saved = await facts();
    expect(await edit(formFor(entry, { note: 'x'.repeat(2001) }))).toEqual({ ok: false, type: 'validation-error', field: 'note', reason: 'invalid-note' });
    expect(await facts()).toEqual(saved);
    expect((await edit(formFor(entry, { note: 'x'.repeat(2000) }))).ok).toBe(true);
  });

  it('writes nothing when a write fails, and a retry saves everything', async () => {
    const entry = await start(); const saved = await facts();
    const input = withPlan(entry, { plannedStopPrice: '97' });
    const spy = vi.spyOn(db.tradeFees, 'put').mockRejectedValue(new Error('quota'));
    expect(await edit(input)).toEqual({ ok: false, type: 'storage-error', reason: 'trade-save-failed' });
    spy.mockRestore();
    expect(await facts()).toEqual(saved);
    expect(await edit(input)).toMatchObject({ ok: true, planChanged: true });
  });
});

describe('editSavedTrade and the note', () => {
  it('saves the note trimmed, with the rest of the edit', async () => {
    const entry = await start();
    expect(editableTradeDraft(entry).note).toBe('');
    expect((await edit(formFor(entry, { note: '  Held to the plan.\n' }))).ok).toBe(true);
    const after = await read(entry.trade.id);
    expect(after.trade.note).toBe('Held to the plan.');
    expect(editableTradeDraft(after).note).toBe('Held to the plan.');
  });

  it('removes the note when it is blank, so the key is absent', async () => {
    const entry = await start();
    expect((await edit(formFor(entry, { note: 'A note' }))).ok).toBe(true);
    const noted = await read(entry.trade.id);
    expect(noted.trade.note).toBe('A note');
    expect((await edit(formFor(noted, { note: '   ' }), editedAgainAt)).ok).toBe(true);
    expect(Object.hasOwn((await db.trades.get(entry.trade.id))!, 'note')).toBe(false);
    // A trade that never had a note gets no empty one either.
    expect((await edit(formFor(await read(entry.trade.id), { note: '' }), editedThirdAt)).ok).toBe(true);
    expect(Object.hasOwn((await db.trades.get(entry.trade.id))!, 'note')).toBe(false);
  });
});
