import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitBackupRestore, commitTradeImport, exportKairosBackup, prepareBackupRestore, prepareTradeImport } from '../src/application/backup';
import { loadHomeYourTrades } from '../src/application/dashboard/homeDashboardYourTradesQuery';
import { listJournalHistory } from '../src/application/journal';
import { savePracticeTrade } from '../src/application/practice';
import { REPLAY_CANDLE_SIZES, type LoadedReplay } from '../src/application/practice/replayCandles';
import { placeReplayOrder, type ReplayOrder } from '../src/application/practice/replayEngine';
import { projectReplayPicture, saveReplayTrade } from '../src/application/practice/replayTrade';
import { decimalCompare } from '../src/domain/calculations/decimalKernel';
import { createKairosDatabase, inspectKairosDatabaseIntegrity, openKairosDatabase } from '../src/data/database';
import type { TradeExecutionId, TradeFeeId, TradeId, TradePlanId } from '../src/domain/trades';
import { HOUR, rampPrices, replayCandle } from './fixtures/replayCandles';

const names: string[] = [];
async function database(label: string) { const name = `kairos-p27-3-${label}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });
const now = () => '2026-09-25T08:00:00.000Z';
function ids(prefix = 'r') { let index = 0; return <T extends TradeId | TradePlanId | TradeExecutionId | TradeFeeId>() => `${prefix}-${++index}` as T; }

const FIRST = Date.parse('2024-02-27T12:00:00.000Z');
const RAMP = Date.parse('2024-03-01T00:00:00.000Z');
const candles = Array.from({ length: 70 }, (_, i) => replayCandle(FIRST + i * HOUR, ...rampPrices(FIRST + i * HOUR, RAMP)));
const replay: LoadedReplay = { symbol: 'BTCUSDT', quoteAsset: 'USDT', candleSize: REPLAY_CANDLE_SIZES[1], candles, startIndex: 60 };
const placed = placeReplayOrder(candles, 60, { side: 'long', entryPrice: '100', stopPrice: '95', targetPrice: '110', quantity: '2' });
if (!placed.ok) throw new Error(placed.reason);
const order: ReplayOrder = placed.order;
const closedInput = { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2024-03-01T00:00:00.000Z', closedAt: '2024-03-01T09:00:00.000Z', executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2024-03-01T00:00:00.000Z' }, { type: 'exit', price: '110', quantity: '1', executedAt: '2024-03-01T09:00:00.000Z' }] } as const;

async function savedReplay(label: string) {
  const db = await database(label);
  const result = await saveReplayTrade(db, replay, 70, order, { now, createId: ids() });
  if (!result.ok) throw new Error('fixture');
  return { db, result };
}

describe('T-038c the practice source option', () => {
  it('saves a replay source when asked, and paper by default', async () => {
    const db = await database('source');
    const replayed = await savePracticeTrade(db, { ...closedInput, source: 'replay' }, { now, createId: ids('a') });
    expect(replayed).toMatchObject({ ok: true, tradeId: 'a-1', source: 'replay' });
    expect((await db.trades.get('a-1' as TradeId))?.source).toBe('replay');
    const paper = await savePracticeTrade(db, closedInput, { now, createId: ids('b') });
    expect(paper).toMatchObject({ ok: true, source: 'paper' });
    expect((await db.trades.get('b-1' as TradeId))?.source).toBe('paper');
  });

  it('refuses any other source and writes nothing', async () => {
    const db = await database('refuse');
    expect(await savePracticeTrade(db, { ...closedInput, source: 'manual' as never }, { now, createId: ids() })).toEqual({ ok: false, type: 'validation-error', field: 'trade', reason: 'practice-source-invalid' });
    expect(await db.trades.count()).toBe(0);
  });
});

describe('T-038c saving a replay', () => {
  it('saves a finished replay with its entry and exit from the candles', async () => {
    const { db, result } = await savedReplay('finished');
    expect(result).toEqual({ ok: true, tradeId: 'r-1', source: 'replay', persisted: { plans: 1, executions: 2, fees: 0 } });
    expect(await db.trades.get('r-1' as TradeId)).toMatchObject({ symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'replay', grossPnlCurrency: 'USDT', openedAt: candles[60]!.openTime, closedAt: candles[69]!.openTime });
    expect(await db.tradePlans.toArray()).toMatchObject([{ plannedEntryPrice: '100', plannedStopPrice: '95', plannedTargetPrice: '110', plannedQuantity: '2' }]);
    const executions = (await db.tradeExecutions.toArray()).sort((a, b) => a.executedAt.localeCompare(b.executedAt));
    expect(executions.map(e => [e.type, e.price, e.quantity, e.executedAt])).toEqual([['entry', '100', '2', candles[60]!.openTime], ['exit', '110', '2', candles[69]!.openTime]]);
  });

  it.each([60, 65])('refuses a replay that is not finished (cursor %i) and writes nothing', async cursor => {
    const db = await database('unfinished');
    expect(await saveReplayTrade(db, replay, cursor, order, { now, createId: ids() })).toEqual({ ok: false, type: 'not-finished' });
    expect(await db.trades.count()).toBe(0);
  });

  it('stores no price currency when the market has none', async () => {
    const db = await database('no-quote');
    await saveReplayTrade(db, { ...replay, quoteAsset: null }, 70, order, { now, createId: ids() });
    const trade = await db.trades.get('r-1' as TradeId);
    expect(trade && 'grossPnlCurrency' in trade && trade.grossPnlCurrency != null).toBe(false);
  });

  it('counts in practice, never in the Journal or Home', async () => {
    const { db } = await savedReplay('apart');
    const practice = await listJournalHistory(db, { scope: 'practice' });
    expect(practice).toHaveLength(1);
    expect(practice[0]!.visualPnl).toMatchObject({ outcome: 'profit', amount: '20', currency: 'USDT' });
    expect(await listJournalHistory(db)).toHaveLength(0);
    expect(await loadHomeYourTrades(db)).toHaveLength(0);
  });

  it('keeps its replay source through a full restore and a merge import', async () => {
    const { db } = await savedReplay('backup');
    expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(true);
    const exported = await exportKairosBackup(db, new Date(now()));
    if (!exported.ok) throw new Error('export failed');
    const restored = await database('restored');
    const prepared = await prepareBackupRestore(restored, exported.file.contents);
    if (!prepared.ok) throw new Error('prepare failed');
    expect((await commitBackupRestore(restored, prepared.restore)).ok).toBe(true);
    expect((await restored.trades.get('r-1' as TradeId))?.source).toBe('replay');
    const merged = await database('merged');
    const importing = await prepareTradeImport(merged, exported.file.contents);
    if (!importing.ok) throw new Error('import prepare failed');
    expect(importing.import.preview).toMatchObject({ newPracticeTrades: 1, newTrades: 0 });
    expect((await commitTradeImport(merged, importing.import)).ok).toBe(true);
    expect((await merged.trades.toArray()).map(trade => trade.source)).toEqual(['replay']);
  });
});

describe('T-038c the replay picture', () => {
  const info = (model: NonNullable<ReturnType<typeof projectReplayPicture>>, key: string) => model.info.find(row => row.key === key);

  it('shows only candles before a trade is placed', () => {
    const model = projectReplayPicture(replay, 60, null)!;
    expect(model.candles).toHaveLength(60);
    expect(model.riskBox).toBeNull();
    expect(model.markers).toEqual([]);
    expect(model.candles.every(candle => candle.beyond === null)).toBe(true);
  });

  it('draws the plan while it waits', () => {
    const model = projectReplayPicture(replay, 60, order)!;
    expect([info(model, 'planned-entry')?.value, info(model, 'stop')?.value, info(model, 'target')?.value]).toEqual(['100', '95', '110']);
    expect(model.status).toBe('draft');
    expect(model.markers).toEqual([]);
    const range = model.priceRange!;
    expect(decimalCompare(range.low, '95')).toBeLessThanOrEqual(0);
    expect(decimalCompare(range.high, '110')).toBeGreaterThanOrEqual(0);
  });

  it('marks the entry once it fills, and the result once it closes', () => {
    const open = projectReplayPicture(replay, 61, order)!;
    expect(open.markers).toEqual([expect.objectContaining({ kind: 'entry', at: candles[60]!.openTime, price: '100' })]);
    expect(open.riskBox).not.toBeNull();
    expect(open.status).toBe('open');
    expect(open.candles.every(candle => Date.parse(candle.time) < Date.parse(candles[61]!.openTime))).toBe(true);
    const closed = projectReplayPicture(replay, 70, order)!;
    expect(closed.markers.map(marker => marker.kind)).toEqual(['entry', 'exit']);
    expect(info(closed, 'result')).toMatchObject({ value: '20', unit: 'USDT' });
  });
});
