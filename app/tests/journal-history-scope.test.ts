import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { loadHomeYourTrades } from '../src/application/dashboard/homeDashboardYourTradesQuery';
import { loadGoalsProgress, writeGoalsPreference } from '../src/application/goals';
import { getJournalHistoryEntry, JOURNAL_HISTORY_SOURCES, listJournalHistory, listJournalVisualPnlDailySummary } from '../src/application/journal';
import { loadTradeReview } from '../src/application/journal/loadTradeReview';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { TradeExecutionId, TradeFeeId, TradeId, TradePlanId } from '../src/domain/trades';

const names: string[] = [];
async function database(label: string) { const name = `kairos-p29-2-${label}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });
function ids(prefix: string) { let index = 0; return <T extends TradeId | TradePlanId | TradeExecutionId | TradeFeeId>() => `${prefix}-${++index}` as T; }
const closed = (symbol: string, day: string, exitPrice: string) => ({ symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: `${day}T09:00:00.000Z`, closedAt: `${day}T10:00:00.000Z`, executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: `${day}T09:00:00.000Z` }, { type: 'exit', price: exitPrice, quantity: '1', executedAt: `${day}T10:00:00.000Z` }] } as const);

async function seeded(label: string) {
  const db = await database(label);
  const createId = ids('t');
  let tick = 0; const now = () => `2026-09-18T12:00:0${tick++}.000Z`;
  const real = await saveManualTrade(db, closed('BTCUSDT', '2026-09-17', '150'), { now, createId });
  const paper = await savePracticeTrade(db, closed('ETHUSDT', '2026-09-18', '10'), { now, createId });
  const paperOpen = await savePracticeTrade(db, { symbol: 'SOLUSDT', marketType: 'crypto', side: 'short', status: 'open', openedAt: '2026-09-18T11:00:00.000Z' }, { now, createId });
  if (!real.ok || !paper.ok || !paperOpen.ok) throw new Error('fixture');
  return { db, real: real.tradeId, paper: paper.tradeId, paperOpen: paperOpen.tradeId };
}

describe('P29.2 journal history source scope', () => {
  it('declares the real and practice source sets', () => {
    expect(JOURNAL_HISTORY_SOURCES).toEqual({ real: ['manual', 'import', 'broker-import'], practice: ['paper', 'replay'] });
  });

  it('lists real trades by default, practice trades only on request, with the released bound and status paths', async () => {
    const { db, real, paper, paperOpen } = await seeded('scope');
    expect((await listJournalHistory(db)).map(entry => entry.trade.id)).toEqual([real]);
    expect((await listJournalHistory(db, { scope: 'real', status: 'closed' })).map(entry => entry.trade.id)).toEqual([real]);
    expect((await listJournalHistory(db, { scope: 'practice' })).map(entry => entry.trade.id)).toEqual([paperOpen, paper]);
    expect((await listJournalHistory(db, { scope: 'practice', status: 'closed' })).map(entry => entry.trade.id)).toEqual([paper]);
    expect((await listJournalHistory(db, { scope: 'practice', limit: 1 })).map(entry => entry.trade.id)).toEqual([paperOpen]);
    expect((await listJournalHistory(db, { status: 'open' })).map(entry => entry.trade.id)).toEqual([]);
    expect((await listJournalHistory(db, { scope: 'practice' }))[1]!.metrics?.grossPnl).toBe('-90');
  });

  it('keeps exact-id review unscoped, so a practice entry still reads with its source', async () => {
    const { db, paper } = await seeded('review');
    expect((await getJournalHistoryEntry(db, paper))?.trade.source).toBe('paper');
  });

  it('keeps practice trades out of every released real-result consumer', async () => {
    const { db, real } = await seeded('consumers');
    const { metadata } = createKairosRepositories(db);
    await writeVisualPnlTimeZonePreference(metadata, 'UTC', '2026-09-18T12:00:00.000Z');
    await writeGoalsPreference(metadata, { tradesPerMonthTarget: '5', maxTradesPerDay: '1' }, '2026-09-18T12:00:00.000Z');
    const daily = await listJournalVisualPnlDailySummary(db, 'UTC');
    expect(daily.days.map(day => day.dayKey)).toEqual(['2026-09-17']);
    const home = await loadHomeYourTrades(db);
    expect(home.map(trade => trade.id)).toEqual([real]);
    const goals = await loadGoalsProgress(db, '2026-09-18T12:00:00.000Z');
    expect(goals.kind).toBe('ready');
    if (goals.kind !== 'ready' || goals.progress.kind !== 'ready') throw new Error('unreachable');
    expect(goals.progress.tradesPerMonth).toMatchObject({ current: 1 });
    expect(goals.progress.maxTradesPerDay).toMatchObject({ today: 0 });
    const review = await loadTradeReview(null, db);
    expect(review.kind).toBe('selection');
    if (review.kind !== 'selection') throw new Error('unreachable');
    expect(review.entries.map(entry => entry.trade.id)).toEqual([real]);
  });
});
