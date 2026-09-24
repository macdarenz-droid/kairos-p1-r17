import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { openDraftTrade, type DraftTradeSnapshot } from '../src/application/trades/openDraftTrade';
import { updateOpenManualTrade, type OpenTradeSnapshot } from '../src/application/trades/updateOpenManualTrade';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import type { TradeExecutionId, TradeFeeId, TradeId, TradePlanId } from '../src/domain/trades';

const names: string[] = [];
async function database(label: string) { const name = `kairos-p35-1-${label}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });
function ids() { let index = 0; return <T extends TradeId | TradePlanId | TradeExecutionId | TradeFeeId>() => `p35-id-${++index}` as T; }
const now = () => '2026-09-18T18:00:00.000Z';
const openedAt = '2026-09-18T09:00:00.000Z';
const draftInput = { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'draft' } as const;

async function openTradeSnapshot(db: Awaited<ReturnType<typeof database>>, id: TradeId): Promise<OpenTradeSnapshot> {
  const trade = (await db.trades.get(id))!;
  return { trade, executions: await db.tradeExecutions.where('tradeId').equals(id).toArray(), fees: await db.tradeFees.where('tradeId').equals(id).toArray() };
}
async function draftSnapshot(db: Awaited<ReturnType<typeof database>>, id: TradeId): Promise<DraftTradeSnapshot> {
  const trade = (await db.trades.get(id))!;
  return { trade, executions: await db.tradeExecutions.where('tradeId').equals(id).toArray(), fees: await db.tradeFees.where('tradeId').equals(id).toArray() };
}

describe('P35.1 allowed-source option on the released commands', () => {
  it('openDraftTrade refuses a practice draft by default and accepts it only when named, keeping id and plan', async () => {
    const db = await database('open-draft');
    const createId = ids();
    const paper = await savePracticeTrade(db, { ...draftInput, plan: { plannedEntryPrice: '100', plannedQuantity: '1' } }, { now, createId });
    if (!paper.ok) throw new Error('fixture');
    const snapshot = await draftSnapshot(db, paper.tradeId);
    expect(await openDraftTrade(db, { expected: snapshot, openedAt, executions: [], fees: [] }, { now, createId })).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-not-draft-manual' });
    expect((await db.trades.get(paper.tradeId))?.status).toBe('draft');
    const result = await openDraftTrade(db, { expected: snapshot, openedAt, executions: [], fees: [], allowedSources: ['paper'] }, { now, createId });
    expect(result).toEqual({ ok: true, tradeId: paper.tradeId, persisted: { plans: 0, executions: 0, fees: 0 } });
    expect(await db.trades.get(paper.tradeId)).toMatchObject({ id: paper.tradeId, source: 'paper', status: 'open', openedAt });
  });

  it('openDraftTrade with allowedSources naming paper still refuses a manual draft when paper alone is allowed, and refuses an open trade regardless', async () => {
    const db = await database('open-draft-mixed');
    const createId = ids();
    const manualDraft = await saveManualTrade(db, draftInput, { now, createId });
    const openPaper = await savePracticeTrade(db, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'short', status: 'open', openedAt }, { now, createId });
    if (!manualDraft.ok || !openPaper.ok) throw new Error('fixture');
    expect(await openDraftTrade(db, { expected: await draftSnapshot(db, manualDraft.tradeId), openedAt, executions: [], fees: [], allowedSources: ['paper'] }, { now, createId })).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-not-draft-manual' });
    expect(await openDraftTrade(db, { expected: await draftSnapshot(db, openPaper.tradeId), openedAt, executions: [], fees: [], allowedSources: ['manual', 'paper'] }, { now, createId })).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-not-draft-manual' });
  });

  it('updateOpenManualTrade refuses a practice trade by default, accepts it only when named, and refuses once the trade is no longer open, over the practice scope', async () => {
    const db = await database('update-open');
    const createId = ids();
    const paper = await savePracticeTrade(db, { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt }, { now, createId });
    if (!paper.ok) throw new Error('fixture');
    const snapshot = await openTradeSnapshot(db, paper.tradeId);
    expect(await updateOpenManualTrade(db, { expected: snapshot, status: 'closed', closedAt: '2026-09-18T10:00:00.000Z', executions: [{ type: 'exit', price: '110', quantity: '1', executedAt: '2026-09-18T10:00:00.000Z' }], fees: [] }, { now, createId })).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-not-open-manual' });
    const closed = await updateOpenManualTrade(db, { expected: snapshot, status: 'closed', closedAt: '2026-09-18T10:00:00.000Z', executions: [{ type: 'exit', price: '110', quantity: '1', executedAt: '2026-09-18T10:00:00.000Z' }], fees: [], allowedSources: ['paper'] }, { now, createId });
    expect(closed).toMatchObject({ ok: true, tradeId: paper.tradeId });
    expect(await db.trades.get(paper.tradeId)).toMatchObject({ source: 'paper', status: 'closed', closedAt: '2026-09-18T10:00:00.000Z' });
    expect(await updateOpenManualTrade(db, { expected: snapshot, status: 'closed', closedAt: '2026-09-18T10:00:00.000Z', executions: [], fees: [], allowedSources: ['paper'] }, { now, createId })).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-not-open-manual' });
  });

  it('detects a change to the practice trade made while still open and refuses with trade-changed', async () => {
    const db = await database('mid-flight');
    const createId = ids();
    const paper = await savePracticeTrade(db, { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt }, { now, createId });
    if (!paper.ok) throw new Error('fixture');
    const stale = await openTradeSnapshot(db, paper.tradeId);
    expect((await updateOpenManualTrade(db, { expected: stale, status: 'open', closedAt: null, executions: [{ type: 'entry', price: '1', quantity: '1', executedAt: openedAt }], fees: [], allowedSources: ['paper'] }, { now, createId })).ok).toBe(true);
    expect(await updateOpenManualTrade(db, { expected: stale, status: 'open', closedAt: null, executions: [{ type: 'entry', price: '2', quantity: '1', executedAt: openedAt }], fees: [], allowedSources: ['paper'] }, { now, createId })).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-changed' });
  });

  it('never touches a manual trade when only paper is allowed, and never touches a practice trade when the default (manual only) applies', async () => {
    const db = await database('isolation');
    const createId = ids();
    const manual = await saveManualTrade(db, { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt }, { now, createId });
    const paper = await savePracticeTrade(db, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'short', status: 'open', openedAt }, { now, createId });
    if (!manual.ok || !paper.ok) throw new Error('fixture');
    expect(await updateOpenManualTrade(db, { expected: await openTradeSnapshot(db, manual.tradeId), status: 'closed', closedAt: '2026-09-18T10:00:00.000Z', executions: [{ type: 'exit', price: '1', quantity: '1', executedAt: '2026-09-18T10:00:00.000Z' }], fees: [], allowedSources: ['paper'] }, { now, createId })).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-not-open-manual' });
    expect(await updateOpenManualTrade(db, { expected: await openTradeSnapshot(db, paper.tradeId), status: 'closed', closedAt: '2026-09-18T10:00:00.000Z', executions: [{ type: 'exit', price: '1', quantity: '1', executedAt: '2026-09-18T10:00:00.000Z' }], fees: [] }, { now, createId })).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-not-open-manual' });
    expect((await db.trades.get(manual.tradeId))?.status).toBe('open');
    expect((await db.trades.get(paper.tradeId))?.status).toBe('open');
  });
});
