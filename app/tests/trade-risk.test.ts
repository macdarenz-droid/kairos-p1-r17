import { describe, expect, it } from 'vitest';
import { describeTimesRisked, projectTradeMoneyAtRisk, projectTradeTimesRisked, type TradeRiskInput } from '../src/application/performance/tradeRisk';
import { projectTradePicture } from '../src/application/trade-visualizer';
import { calculateTradeMetrics } from '../src/domain/calculations';
import {
  parseDecimalString,
  type DecimalString,
  type TradeExecutionId,
  type TradeExecutionRecord,
  type TradeFeeId,
  type TradeFeeRecord,
  type TradeId,
  type TradePlanId,
  type TradePlanRecord,
  type TradeRecord,
} from '../src/domain/trades';

function dec(value: string): DecimalString {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error(`fixture decimal ${value}`);
  return parsed.value;
}
const tradeId = 'trade-1' as TradeId;
const opened = '2026-09-20T09:00:00.000Z', closed = '2026-09-20T12:00:00.000Z', now = '2026-09-24T12:00:00.000Z';
function trade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return { id: tradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USDT', openedAt: opened, closedAt: closed, createdAt: opened, updatedAt: closed, ...overrides };
}
function plan(entry: string | null, stop: string | null, quantity: string | null = '2', id = 'plan-1', updatedAt = opened): TradePlanRecord {
  return { id: id as TradePlanId, tradeId, plannedEntryPrice: entry === null ? null : dec(entry), plannedStopPrice: stop === null ? null : dec(stop), plannedTargetPrice: null, plannedQuantity: quantity === null ? null : dec(quantity), createdAt: updatedAt, updatedAt };
}
function fill(id: string, type: 'entry' | 'exit', price: string, quantity: string, executedAt = type === 'entry' ? opened : closed): TradeExecutionRecord {
  return { id: id as TradeExecutionId, tradeId, type, price: dec(price), quantity: dec(quantity), executedAt, createdAt: executedAt };
}
const fee = (amount: string): TradeFeeRecord => ({ id: 'fee-1' as TradeFeeId, tradeId, executionId: null, amount: dec(amount), currency: 'USDT', createdAt: closed } as TradeFeeRecord);

function input(t: TradeRecord, plans: TradePlanRecord[], executions: TradeExecutionRecord[], fees: TradeFeeRecord[] = []): TradeRiskInput & { fees: TradeFeeRecord[] } {
  const metrics = calculateTradeMetrics(t.side, executions, undefined, fees, { grossPnlCurrency: t.grossPnlCurrency! });
  return { trade: t, plans, executions, metrics: metrics.ok ? metrics.value : null, fees };
}
const picture = (value: ReturnType<typeof input>) => projectTradePicture({ trade: value.trade, plans: value.plans, executions: value.executions, fees: value.fees, candles: null, now });
const row = (value: ReturnType<typeof input>, key: string) => picture(value).info.find(item => item.key === key);

describe('T-050b money at risk and × what you risked (one owner)', () => {
  it('a trade filled away from its plan uses the real entries', () => {
    const away = input(trade(), [plan('100', '90')], [fill('e1', 'entry', '102', '2'), fill('x1', 'exit', '120', '2')]);
    expect(projectTradeMoneyAtRisk(away)).toMatchObject({ available: true, basis: 'as-traded', entryPrice: '102', stopPrice: '90', size: '2', amount: '24', currency: 'USDT' });
    expect(projectTradeTimesRisked(away)).toMatchObject({ available: true, value: '1.5', moneyAtRisk: '24' });
    expect(row(away, 'actual-r')).toMatchObject({ value: '1.5', text: '+1.5× what you risked' });
  });

  it('a scaled-in trade adds up every entry', () => {
    const scaled = input(trade({ status: 'open', closedAt: null }), [plan('100', '95')], [fill('e1', 'entry', '100', '1'), fill('e2', 'entry', '103', '2')]);
    expect(projectTradeMoneyAtRisk(scaled)).toMatchObject({ available: true, basis: 'as-traded', entryPrice: '102', size: '3', amount: '21' });
  });

  it('a draft is as planned and has no × what you risked', () => {
    const draft = input(trade({ status: 'draft', closedAt: null }), [plan('100', '90', '2')], []);
    expect(projectTradeMoneyAtRisk(draft)).toMatchObject({ available: true, basis: 'as-planned', entryPrice: '100', size: '2', amount: '20' });
    expect(projectTradeTimesRisked(draft)).toEqual({ available: false, reason: 'no-result' });
  });

  it('reads the latest plan', () => {
    const earlier = plan('100', '90', '2', 'plan-1', '2026-09-20T08:00:00.000Z');
    const later = plan('100', '95', '3', 'plan-2', '2026-09-20T08:30:00.000Z');
    const traded = input(trade(), [earlier, later], [fill('e1', 'entry', '100', '2'), fill('x1', 'exit', '110', '2')]);
    expect(projectTradeMoneyAtRisk(traded)).toMatchObject({ stopPrice: '95', amount: '10' });
    const draft = input(trade({ status: 'draft', closedAt: null }), [earlier, later], []);
    expect(row(draft, 'size')?.value).toBe('3');
  });

  it('gives no number for a missing or wrong-side stop', () => {
    const fills = [fill('e1', 'entry', '100', '2'), fill('x1', 'exit', '120', '2')];
    const noStop = input(trade(), [plan('100', null)], fills);
    expect(projectTradeMoneyAtRisk(noStop)).toMatchObject({ available: false, reason: 'no-stop' });
    expect(projectTradeTimesRisked(noStop)).toEqual({ available: false, reason: 'no-stop' });
    const wrongSide = input(trade({ side: 'short' }), [plan('100', '90')], fills);
    expect(projectTradeMoneyAtRisk(wrongSide)).toMatchObject({ available: false, reason: 'stop-not-on-loss-side' });
    expect(projectTradeTimesRisked(wrongSide)).toEqual({ available: false, reason: 'stop-not-on-loss-side' });
    expect(picture(wrongSide).missing).toContainEqual({ part: 'actual-r', message: 'No × what you risked: the stop is not on the losing side of your entry.' });
    const atEntry = input(trade(), [plan('100', '100')], fills);
    expect(projectTradeMoneyAtRisk(atEntry)).toMatchObject({ available: false, reason: 'stop-at-entry' });
  });

  it('needs no planned entry once there are entries', () => {
    const noEntry = input(trade(), [plan(null, '90')], [fill('e1', 'entry', '100', '2'), fill('x1', 'exit', '120', '2')], [fee('1')]);
    expect(projectTradeMoneyAtRisk(noEntry)).toMatchObject({ available: true, amount: '20' });
    expect(projectTradeTimesRisked(noEntry)).toMatchObject({ available: true, value: '1.95' });
    expect(row(noEntry, 'actual-r')).toMatchObject({ value: '1.95', text: '+1.95× what you risked' });
  });

  it('futures use the same price × size basis as crypto', () => {
    const fills = [fill('e1', 'entry', '102', '2'), fill('x1', 'exit', '120', '2')];
    const crypto = input(trade(), [plan('100', '90')], fills);
    const futures = input(trade({ marketType: 'futures' }), [plan('100', '90')], fills);
    expect(projectTradeMoneyAtRisk(futures)).toEqual(projectTradeMoneyAtRisk(crypto));
    expect(projectTradeTimesRisked(futures)).toEqual(projectTradeTimesRisked(crypto));
  });

  it('refuses fills it cannot add up, even with no entry fill', () => {
    const broken = input(trade(), [plan('100', '90', '2')], [{ ...fill('x1', 'exit', '110', '2'), price: 'abc' as DecimalString }]);
    expect(projectTradeMoneyAtRisk(broken)).toMatchObject({ available: false, reason: 'invalid-decimal' });
  });

  it('an open trade has no result yet', () => {
    const open = input(trade({ status: 'open', closedAt: null }), [plan('100', '90')], [fill('e1', 'entry', '100', '2')]);
    expect(projectTradeTimesRisked(open)).toEqual({ available: false, reason: 'no-result' });
  });

  it('words', () => {
    expect(describeTimesRisked(dec('1.954'))).toBe('+1.95× what you risked');
    expect(describeTimesRisked(dec('-0.125'))).toBe('-0.13× what you risked');
    expect(describeTimesRisked(dec('0.004'))).toBe('0× what you risked');
  });
});
