import { describe, expect, it } from 'vitest';
import { describeTradePlanVsExecution } from '../src/application/coach/coachWords';
import { projectTradePlanVsExecution } from '../src/application/trades/planVsExecution';
import { calculateTradeMetrics } from '../src/domain/calculations';
import type { DecimalString, TradeExecutionRecord, TradeExecutionId, TradeId, TradePlanId, TradePlanRecord, TradeRecord, TradeSide, TradeSource, TradeStatus } from '../src/domain/trades';

const AT = '2026-09-20T10:00:00.000Z';
const tradeId = 'trade-1' as TradeId;
function trade(side: TradeSide = 'long', status: TradeStatus = 'closed', source: TradeSource = 'manual'): TradeRecord {
  return { id: tradeId, symbol: 'BTCUSDT', marketType: 'crypto', side, status, source, grossPnlCurrency: 'USDT', openedAt: AT, closedAt: status === 'closed' ? AT : null, createdAt: AT, updatedAt: AT } as TradeRecord;
}
function plan(values: { stop?: string; quantity?: string; entry?: string }, updatedAt = AT, id = 'plan-1'): TradePlanRecord {
  return { id: id as TradePlanId, tradeId, plannedEntryPrice: (values.entry ?? null) as DecimalString | null, plannedStopPrice: (values.stop ?? null) as DecimalString | null, plannedTargetPrice: null, plannedQuantity: (values.quantity ?? null) as DecimalString | null, createdAt: AT, updatedAt };
}
let n = 0;
const fill = (type: 'entry' | 'exit', price: string, quantity: string): TradeExecutionRecord =>
  ({ id: `execution-${++n}` as TradeExecutionId, tradeId, type, price: price as DecimalString, quantity: quantity as DecimalString, executedAt: AT, createdAt: AT });
function metrics(side: TradeSide, ...fills: TradeExecutionRecord[]) {
  const result = calculateTradeMetrics(side, fills);
  if (!result.ok) throw new Error('fixture');
  return result.value;
}
const longPlan = [plan({ entry: '100', stop: '95', quantity: '1' })];
const judge = (exits: TradeExecutionRecord[], entryQuantity = '3', entryPrice = '100') =>
  projectTradePlanVsExecution(trade(), longPlan, metrics('long', fill('entry', entryPrice, entryQuantity), ...exits));

describe('T-041a plan versus what you did', () => {
  it('finds a long trade that was bigger than planned and closed beyond its stop', () => {
    const result = judge([fill('exit', '90', '3')]);
    expect(result).toEqual({ size: { verdict: 'bigger', planned: '1', traded: '3' }, stop: { verdict: 'passed', stop: '95', averageExit: '90' } });
    expect(Object.isFrozen(result) && Object.isFrozen(result.size) && Object.isFrozen(result.stop)).toBe(true);
    expect(describeTradePlanVsExecution(result)).toEqual(['Your stop was 95, and you closed at 90 on average, beyond it.', 'You planned a size of 1 and traded 3.']);
    expect(Object.isFrozen(describeTradePlanVsExecution(result))).toBe(true);
  });

  it('keeps a stop hit exactly or not reached, and compares sizes exactly', () => {
    expect(judge([fill('exit', '95', '3')]).stop.verdict).toBe('kept');
    expect(judge([fill('exit', '96', '3')]).stop.verdict).toBe('kept');
    expect(judge([fill('exit', '96', '1')], '1').size.verdict).toBe('as-planned');
    expect(judge([fill('exit', '96', '0.5')], '0.5').size.verdict).toBe('smaller');
    const kept = judge([fill('exit', '96', '1')], '1');
    expect(describeTradePlanVsExecution(kept)).toEqual([]);
  });

  it('uses the average exit of partial exits', () => {
    expect(judge([fill('exit', '97', '1'), fill('exit', '91', '2')]).stop).toEqual({ verdict: 'passed', stop: '95', averageExit: '93' });
    const stopOnly = { ...judge([fill('exit', '90', '1')], '1') };
    expect(describeTradePlanVsExecution(stopOnly)).toEqual(['Your stop was 95, and you closed at 90 on average, beyond it.']);
  });

  it('judges a short trade the other way', () => {
    const shortPlan = [plan({ stop: '105' })];
    const passed = projectTradePlanVsExecution(trade('short'), shortPlan, metrics('short', fill('entry', '100', '1'), fill('exit', '108', '1')));
    expect(passed.stop).toEqual({ verdict: 'passed', stop: '105', averageExit: '108' });
    const kept = projectTradePlanVsExecution(trade('short'), shortPlan, metrics('short', fill('entry', '100', '1'), fill('exit', '105', '1')));
    expect(kept.stop.verdict).toBe('kept');
  });

  it('does not judge a stop on the wrong side of the entry', () => {
    expect(judge([fill('exit', '90', '1')], '1', '94').stop).toEqual({ verdict: 'unknown', reason: 'stop-not-on-loss-side' });
    expect(judge([fill('exit', '90', '1')], '1', '95').stop).toEqual({ verdict: 'unknown', reason: 'stop-not-on-loss-side' });
  });

  it('judges only the size of an open trade', () => {
    const result = projectTradePlanVsExecution(trade('long', 'open'), longPlan, metrics('long', fill('entry', '100', '3')));
    expect(result.stop).toEqual({ verdict: 'unknown', reason: 'not-closed' });
    expect(result.size.verdict).toBe('bigger');
  });

  it('never makes a verdict from missing facts', () => {
    const closed = metrics('long', fill('entry', '100', '3'), fill('exit', '90', '3'));
    expect(projectTradePlanVsExecution(trade(), [], closed)).toEqual({ size: { verdict: 'unknown', reason: 'no-planned-size' }, stop: { verdict: 'unknown', reason: 'no-stop' } });
    const stopOnly = projectTradePlanVsExecution(trade(), [plan({ stop: '95' })], closed);
    expect(stopOnly.size).toEqual({ verdict: 'unknown', reason: 'no-planned-size' });
    expect(stopOnly.stop.verdict).toBe('passed');
    expect(projectTradePlanVsExecution(trade(), longPlan, null)).toEqual({ size: { verdict: 'unknown', reason: 'no-entries' }, stop: { verdict: 'unknown', reason: 'no-exits' } });
  });

  it('never judges a replay trade', () => {
    const result = projectTradePlanVsExecution(trade('long', 'closed', 'replay'), longPlan, metrics('long', fill('entry', '100', '3'), fill('exit', '90', '3')));
    expect(result).toEqual({ size: { verdict: 'unknown', reason: 'from-candles' }, stop: { verdict: 'unknown', reason: 'from-candles' } });
  });

  it('uses the latest plan and compares tiny sizes exactly', () => {
    const plans = [plan({ quantity: '3' }, '2026-09-20T08:00:00.000Z', 'plan-old'), plan({ quantity: '1' }, '2026-09-20T09:00:00.000Z', 'plan-new')];
    expect(projectTradePlanVsExecution(trade('long', 'open'), plans, metrics('long', fill('entry', '100', '2'))).size).toEqual({ verdict: 'bigger', planned: '1', traded: '2' });
    const tiny = projectTradePlanVsExecution(trade('long', 'open'), [plan({ quantity: '0.00000001' })], metrics('long', fill('entry', '100', '0.000000011')));
    expect(tiny.size.verdict).toBe('bigger');
  });
});
