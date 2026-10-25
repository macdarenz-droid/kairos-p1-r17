import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJournalHistoryEntry, type JournalHistoryEntry } from '../src/application/journal';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade, saveTradeNote, tradeRevision, type SaveManualTradeInput, type SaveTradeNoteInput } from '../src/application/trades';
import { createKairosDatabase, type KairosDatabase } from '../src/data/database';
import type { DecimalString, TradeId, TradePlanId, TradePlanRecord } from '../src/domain/trades';

let db: KairosDatabase;
afterEach(async () => { vi.restoreAllMocks(); if (db) { db.close(); await db.delete(); } });

const savedAt = '2026-09-20T10:00:00.000Z';
const noteAt = '2026-09-20T10:05:00.000Z';
const laterAt = '2026-09-20T10:10:00.000Z';
const opened = '2026-09-20T09:00:00.000Z';
const closed = '2026-09-20T09:45:00.000Z';

const closedTrade: SaveManualTradeInput = {
  symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: opened, closedAt: closed,
  plan: { plannedEntryPrice: '100', plannedStopPrice: '95', plannedTargetPrice: '110', plannedQuantity: '1', reason: 'Clean break' },
  executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: opened }, { type: 'exit', price: '108', quantity: '1', executedAt: closed }],
  fees: [{ amount: '0.5', currency: 'USDT' }],
};

async function open(): Promise<void> {
  db = createKairosDatabase('trade-note-' + crypto.randomUUID());
  await db.open();
}
async function savedReal(): Promise<TradeId> {
  await open();
  const saved = await saveManualTrade(db, closedTrade, { now: () => savedAt });
  if (!saved.ok) throw new Error('fixture: ' + JSON.stringify(saved));
  return saved.tradeId;
}
async function savedPractice(source: 'paper' | 'replay'): Promise<TradeId> {
  await open();
  const saved = await savePracticeTrade(db, { ...closedTrade, source }, { now: () => savedAt });
  if (!saved.ok) throw new Error('fixture: ' + JSON.stringify(saved));
  return saved.tradeId;
}
const read = async (id: TradeId): Promise<JournalHistoryEntry> => (await getJournalHistoryEntry(db, id))!;
async function facts() {
  return { trades: await db.trades.toArray(), plans: await db.tradePlans.toArray(), executions: await db.tradeExecutions.toArray(), fees: await db.tradeFees.toArray() };
}
/** The note command as the trade page calls it: the revision of the entry it showed. */
async function noteInput(id: TradeId, note: string, scope: SaveTradeNoteInput['scope'] = 'real'): Promise<SaveTradeNoteInput> {
  return { tradeId: id, expectedRevision: tradeRevision(await read(id)), note, scope };
}

describe('saveTradeNote (the trade\'s own note, D265)', () => {
  it('saves the note trimmed and moves the updated time on, changing nothing else', async () => {
    const id = await savedReal(); const before = await facts();
    expect(await saveTradeNote(db, await noteInput(id, '  Moved my stop too early.\n'), { now: () => noteAt })).toEqual({ ok: true, note: 'Moved my stop too early.' });
    const after = await facts();
    expect(after.trades).toEqual([{ ...before.trades[0], note: 'Moved my stop too early.', updatedAt: noteAt }]);
    expect(after.plans).toEqual(before.plans);
    expect(after.executions).toEqual(before.executions);
    expect(after.fees).toEqual(before.fees);
    expect((await read(id)).trade.note).toBe('Moved my stop too early.');
  });

  it('changes a saved note, and a blank one removes it so the key is absent', async () => {
    const id = await savedReal();
    expect((await saveTradeNote(db, await noteInput(id, 'First thought'), { now: () => noteAt })).ok).toBe(true);
    expect(await saveTradeNote(db, await noteInput(id, 'Second thought'), { now: () => laterAt })).toEqual({ ok: true, note: 'Second thought' });
    expect((await db.trades.get(id))!.note).toBe('Second thought');

    const removed = await saveTradeNote(db, await noteInput(id, '  \n\t '), { now: () => '2026-09-20T10:15:00.000Z' });
    expect(removed).toEqual({ ok: true, note: null });
    const stored = (await db.trades.get(id))!;
    expect(Object.hasOwn(stored, 'note')).toBe(false);
    expect(stored.updatedAt).toBe('2026-09-20T10:15:00.000Z');
    expect((await read(id)).trade.note ?? null).toBeNull();
  });

  it('writes nothing when the note did not change', async () => {
    const id = await savedReal(); const before = await facts();
    // A trade with no note, saved with a blank one.
    expect(await saveTradeNote(db, await noteInput(id, '   '), { now: () => noteAt })).toEqual({ ok: true, note: null });
    expect(await facts()).toEqual(before);
    // The same note typed again, even with other spaces around it.
    expect((await saveTradeNote(db, await noteInput(id, 'Kept'), { now: () => noteAt })).ok).toBe(true);
    const withNote = await facts();
    expect(await saveTradeNote(db, await noteInput(id, ' Kept '), { now: () => laterAt })).toEqual({ ok: true, note: 'Kept' });
    expect(await facts()).toEqual(withNote);
  });

  it('refuses a note of 2,001 characters, names the note, and writes nothing', async () => {
    const id = await savedReal(); const before = await facts();
    expect(await saveTradeNote(db, await noteInput(id, 'x'.repeat(2001)), { now: () => noteAt })).toEqual({ ok: false, type: 'validation-error', field: 'note', reason: 'invalid-note' });
    expect(await saveTradeNote(db, await noteInput(id, '  ' + 'x'.repeat(2001) + '  '), { now: () => noteAt })).toEqual({ ok: false, type: 'validation-error', field: 'note', reason: 'invalid-note' });
    expect(await facts()).toEqual(before);
  });

  it('accepts a note of exactly 2,000 characters, even with spaces around it', async () => {
    const id = await savedReal();
    const text = 'y'.repeat(2000);
    expect(await saveTradeNote(db, await noteInput(id, `  ${text}  `), { now: () => noteAt })).toEqual({ ok: true, note: text });
    expect((await db.trades.get(id))!.note).toBe(text);
  });

  it('refuses a page that is out of date, because another tab saved a note first', async () => {
    const id = await savedReal();
    const stale = await noteInput(id, 'From the old page');
    expect((await saveTradeNote(db, await noteInput(id, 'From the other tab'), { now: () => noteAt })).ok).toBe(true);
    const before = await facts();
    expect(await saveTradeNote(db, stale, { now: () => laterAt })).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-changed' });
    expect(await facts()).toEqual(before);
    // A page that reads the trade again can save.
    expect(await saveTradeNote(db, await noteInput(id, 'From the new page'), { now: () => laterAt })).toEqual({ ok: true, note: 'From the new page' });
  });

  it('refuses a page that is out of date because another tab added a plan version, even at the same time', async () => {
    const id = await savedReal();
    const stale = await noteInput(id, 'A note');
    const original = (await read(id)).plans[0]!;
    const newer: TradePlanRecord = { ...original, id: 'other-tab-plan' as TradePlanId, plannedStopPrice: '97' as DecimalString };
    await db.tradePlans.put(newer);
    expect(await saveTradeNote(db, stale, { now: () => noteAt })).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-changed' });
    expect(Object.hasOwn((await db.trades.get(id))!, 'note')).toBe(false);
  });

  it('saves a note on a replay trade of the practice list, which has no other edit', async () => {
    const id = await savedPractice('replay');
    expect(await saveTradeNote(db, await noteInput(id, 'The candle ran away', 'practice'), { now: () => noteAt })).toEqual({ ok: true, note: 'The candle ran away' });
    const stored = (await db.trades.get(id))!;
    expect(stored).toMatchObject({ source: 'replay', note: 'The candle ran away', updatedAt: noteAt });
  });

  it('saves a note on a paper trade of the practice list', async () => {
    const id = await savedPractice('paper');
    expect(await saveTradeNote(db, await noteInput(id, 'Practice note', 'practice'), { now: () => noteAt })).toEqual({ ok: true, note: 'Practice note' });
    expect((await db.trades.get(id))!.source).toBe('paper');
  });

  it('does not reach a trade of the other list: it is missing there', async () => {
    const real = await savedReal();
    const realInput = await noteInput(real, 'Wrong list', 'practice');
    const paper = (await savePracticeTrade(db, { ...closedTrade, symbol: 'ETHUSDT' }, { now: () => savedAt }));
    if (!paper.ok) throw new Error('fixture');
    const paperInput = await noteInput(paper.tradeId, 'Wrong list', 'real');
    const before = await facts();
    expect(await saveTradeNote(db, realInput, { now: () => noteAt })).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-missing' });
    expect(await saveTradeNote(db, paperInput, { now: () => noteAt })).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-missing' });
    expect(await facts()).toEqual(before);
  });

  it('says a trade that is not there is missing', async () => {
    const id = await savedReal();
    const input = await noteInput(id, 'Gone');
    expect(await saveTradeNote(db, { ...input, tradeId: 'no-such-trade' as TradeId }, { now: () => noteAt })).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-missing' });
  });

  it('writes nothing when the write fails, and a retry saves', async () => {
    const id = await savedReal(); const before = await facts();
    const input = await noteInput(id, 'Try me');
    const spy = vi.spyOn(db.trades, 'put').mockRejectedValue(new Error('quota'));
    expect(await saveTradeNote(db, input, { now: () => noteAt })).toEqual({ ok: false, type: 'storage-error', reason: 'trade-save-failed' });
    spy.mockRestore();
    expect(await facts()).toEqual(before);
    expect(await saveTradeNote(db, input, { now: () => noteAt })).toEqual({ ok: true, note: 'Try me' });
  });
});
