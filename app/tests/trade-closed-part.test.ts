import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { listJournalClosedTradesInPeriod } from '../src/application/journal/closedTradePeriodQuery';
import { projectTradeClosedPart } from '../src/application/performance/tradeClosedPart';
import { saveManualTrade } from '../src/application/trades';
import { summarizeVisualPnlAggregation } from '../src/application/visual-pnl/aggregationSummary';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import type { DecimalString, TradeExecutionId, TradeExecutionRecord, TradeFeeId, TradeFeeRecord, TradeId, TradeRecord, TradeStatus } from '../src/domain/trades';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-trade-closed-part-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

function trade(status: TradeStatus, currency: string | null = 'USDT'): TradeRecord {
  return {
    id: 'trade-1' as TradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status, source: 'manual',
    ...(currency ? { grossPnlCurrency: currency } : {}),
    openedAt: '2026-09-14T09:00:00.000Z', closedAt: status === 'open' ? null : '2026-09-14T10:00:00.000Z',
    createdAt: '2026-09-14T09:00:00.000Z', updatedAt: '2026-09-14T10:00:00.000Z',
  };
}
function fill(type: 'entry' | 'exit', price: string, quantity: string, time: string): TradeExecutionRecord {
  return { id: `${type}-${time}` as TradeExecutionId, tradeId: 'trade-1' as TradeId, type, price: price as DecimalString, quantity: quantity as DecimalString, executedAt: `2026-09-14T${time}:00.000Z`, createdAt: '2026-09-14T09:00:00.000Z' };
}
function fee(amount: string, currency: string): TradeFeeRecord {
  return { id: `fee-${currency}` as TradeFeeId, tradeId: 'trade-1' as TradeId, executionId: null, amount: amount as DecimalString, currency, createdAt: '2026-09-14T09:00:00.000Z' };
}
const partly = [fill('entry', '100', '2', '09:00'), fill('exit', '110', '1', '10:00')];

describe('T-050c a trade\'s closed part', () => {
  it('gives the closed part of a closed trade whose exit is missing, with the fees so far', () => {
    expect(projectTradeClosedPart({ trade: trade('closed'), executions: partly, fees: [fee('0.3', 'USDT')] })).toEqual({
      available: true, outcome: 'profit', resultBeforeFees: '10', currency: 'USDT', closedQuantity: '1', enteredQuantity: '2', openQuantity: '1',
      rest: 'exit-missing', feesSoFar: { amount: '0.3', currency: 'USDT' },
    });
  });

  it('never changes the trade\'s result or the totals it is part of', async () => {
    const db = await database();
    const saved = await saveManualTrade(db, {
      symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT',
      openedAt: '2026-09-14T09:00:00.000Z', closedAt: '2026-09-14T10:00:00.000Z',
      executions: [{ type: 'entry', price: '100', quantity: '2', executedAt: '2026-09-14T09:00:00.000Z' }, { type: 'exit', price: '110', quantity: '1', executedAt: '2026-09-14T10:00:00.000Z' }],
      fees: [{ amount: '0.3', currency: 'USDT' }],
    });
    if (!saved.ok) throw new Error('fixture');
    const listed = await listJournalClosedTradesInPeriod(db, { timeZone: 'UTC', fromDayKey: null, toDayKey: null });
    if (!listed.ok) throw new Error('fixture');
    const [entry] = listed.entries;
    expect(projectTradeClosedPart(entry)).toMatchObject({ available: true, resultBeforeFees: '10', rest: 'exit-missing', feesSoFar: { amount: '0.3', currency: 'USDT' } });
    expect(entry.visualPnl.outcome).toBe('unavailable');
    expect(summarizeVisualPnlAggregation([entry.visualPnl])).toMatchObject({ available: false, reason: 'unavailable-trade-outcome' });
  });

  it('says what is left: still open, or an exit missing on a closed or cancelled trade', () => {
    expect(projectTradeClosedPart({ trade: trade('open'), executions: partly, fees: [] })).toMatchObject({ available: true, rest: 'still-open', feesSoFar: null });
    expect(projectTradeClosedPart({ trade: trade('cancelled'), executions: partly, fees: [] })).toMatchObject({ available: true, rest: 'exit-missing' });
  });

  it('still gives the closed part when fees are in two currencies, without fees', () => {
    expect(projectTradeClosedPart({ trade: trade('closed'), executions: partly, fees: [fee('0.3', 'USDT'), fee('0.001', 'BNB')] })).toMatchObject({ available: true, resultBeforeFees: '10', feesSoFar: null });
  });

  it('keeps an unknown currency unknown', () => {
    expect(projectTradeClosedPart({ trade: trade('closed', null), executions: partly, fees: [] })).toMatchObject({ available: true, currency: null });
  });

  it('says a flat trade is not partly closed', () => {
    expect(projectTradeClosedPart({ trade: trade('closed'), executions: [fill('entry', '100', '1', '09:00'), fill('exit', '110', '1', '10:00')], fees: [] })).toEqual({ available: false, reason: 'not-partly-closed' });
  });
});
