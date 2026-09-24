import { describe, expect, it } from 'vitest';
import { projectTradePicture, type TradePictureInput } from '../src/application/trade-visualizer';
import { calculateRMultiple, calculateRiskPerformance, calculateTradeMetrics } from '../src/domain/calculations';
import {
  parseDecimalString,
  type DecimalString,
  type TradeExecutionId,
  type TradeExecutionRecord,
  type TradeFeeId,
  type TradeFeeRecord,
  type TradeId,
  type TradePlanId,
  type TradeRecord,
} from '../src/domain/trades';
import type { MarketCandle } from '../src/services/market-data/MarketCandleHistoryPort';

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
function plan(entry: string | null, stop: string | null, target: string | null, quantity = '2') {
  return [{ id: 'plan-1' as TradePlanId, tradeId, plannedEntryPrice: entry === null ? null : dec(entry), plannedStopPrice: stop === null ? null : dec(stop), plannedTargetPrice: target === null ? null : dec(target), plannedQuantity: dec(quantity), createdAt: opened, updatedAt: opened }];
}
function fill(id: string, type: 'entry' | 'exit', price: string, quantity: string, executedAt: string): TradeExecutionRecord {
  return { id: id as TradeExecutionId, tradeId, type, price: dec(price), quantity: dec(quantity), executedAt, createdAt: executedAt };
}
const fee: TradeFeeRecord = { id: 'fee-1' as TradeFeeId, tradeId, executionId: null, amount: dec('1'), currency: 'USDT', createdAt: closed } as TradeFeeRecord;
const candles: MarketCandle[] = [
  { openTime: '2026-09-20T08:00:00.000Z', closeTime: '2026-09-20T09:59:59.999Z', open: dec('98'), high: dec('105'), low: dec('95'), close: dec('104') },
  { openTime: '2026-09-20T10:00:00.000Z', closeTime: '2026-09-20T13:59:59.999Z', open: dec('104'), high: dec('125'), low: dec('103'), close: dec('121') },
];
const value = (model: ReturnType<typeof projectTradePicture>, key: string) => model.info.find(row => row.key === key);

const longInput: TradePictureInput = {
  trade: trade(),
  plans: plan('100', '90', '130'),
  executions: [fill('e1', 'entry', '100', '2', opened), fill('x1', 'exit', '120', '2', closed)],
  fees: [fee],
  candles,
  now,
};

describe('T-027a trade picture model', () => {
  it('long trade: boxes, markers and price range cover everything, and info equals the calculation owners', () => {
    const model = projectTradePicture(longInput);
    expect(model.riskBox).toEqual({ entryPrice: '100', edgePrice: '90', top: '100', bottom: '90', startAt: opened, endAt: closed });
    expect(model.rewardBox).toEqual({ entryPrice: '100', edgePrice: '130', top: '130', bottom: '100', startAt: opened, endAt: closed });
    expect(model.markers).toEqual([
      { kind: 'entry', at: opened, price: '100', quantity: '2' },
      { kind: 'exit', at: closed, price: '120', quantity: '2' },
    ]);
    // Lowest 90 (stop), highest 130 (target); 8% of the 40 span on each side.
    expect(model.priceRange).toEqual({ low: '86.8', high: '133.2' });
    expect(model.timeRange).toEqual({ from: '2026-09-20T08:00:00.000Z', to: '2026-09-20T13:59:59.999Z' });
    expect(model.candles).toHaveLength(2);

    const metrics = calculateTradeMetrics('long', longInput.executions, undefined, longInput.fees, { grossPnlCurrency: 'USDT' });
    if (!metrics.ok || metrics.value.netPnl === null) throw new Error('fixture metrics');
    const plannedRatio = calculateRMultiple(dec('30'), dec('10'));
    const realized = calculateRiskPerformance(metrics.value.netPnl, dec('10'), metrics.value.totalEnteredQuantity);
    if (!plannedRatio.ok || !realized.ok) throw new Error('fixture owners');

    expect(value(model, 'result')).toMatchObject({ label: 'Result after fees', value: metrics.value.netPnl, unit: 'USDT', text: `${metrics.value.netPnl} USDT` });
    expect(value(model, 'average-exit')?.value).toBe(metrics.value.averageExitPrice);
    expect(value(model, 'planned-reward')).toMatchObject({ value: plannedRatio.value, text: `Reward is ${plannedRatio.value}× the risk` });
    expect(value(model, 'actual-r')).toMatchObject({ value: realized.realizedR, text: `+${realized.realizedR}× what you risked` });
    expect(value(model, 'duration')).toMatchObject({ value: String(3 * 60 * 60_000), text: '3 h' });
    expect(value(model, 'direction')?.value).toBe('Long');
    expect(value(model, 'size')?.value).toBe('2');
    expect(model.missing).toEqual([]);
  });

  it('short trade: the risk box sits above the entry and the reward box below', () => {
    const model = projectTradePicture({
      ...longInput,
      trade: trade({ side: 'short' }),
      plans: plan('100', '110', '80'),
      executions: [fill('e1', 'entry', '100', '2', opened), fill('x1', 'exit', '85', '2', closed)],
    });
    expect(model.riskBox).toMatchObject({ top: '110', bottom: '100' });
    expect(model.rewardBox).toMatchObject({ top: '100', bottom: '80' });
    expect(value(model, 'direction')?.value).toBe('Short');
    expect(value(model, 'planned-reward')?.value).toBe('2');
  });

  it.each([
    ['no stop', plan('100', null, '130'), 'riskBox', 'stop'],
    ['no target', plan('100', '90', null), 'rewardBox', 'target'],
  ] as const)('%s: that box is missing and `missing` says so', (_label, plans, boxKey, part) => {
    const model = projectTradePicture({ ...longInput, plans });
    expect(model[boxKey]).toBeNull();
    expect(model.missing.map(item => item.part)).toContain(part);
    expect(value(model, 'planned-reward')?.value).toBeNull();
    expect(value(model, 'planned-reward')?.text).toBeNull();
  });

  it('without candles it still builds the picture from the plan and fills only', () => {
    const model = projectTradePicture({ ...longInput, candles: null });
    expect(model.candles).toEqual([]);
    expect(model.priceRange).toEqual({ low: '86.8', high: '133.2' });
    expect(model.timeRange).toEqual({ from: opened, to: closed });
    expect(model.riskBox).not.toBeNull();
    expect(model.missing.map(item => item.part)).toEqual(['candles']);
  });

  it('an open trade ends at the injected now', () => {
    const model = projectTradePicture({
      ...longInput,
      trade: trade({ status: 'open', closedAt: null }),
      executions: [fill('e1', 'entry', '100', '2', opened)],
      fees: [],
      candles: null,
    });
    expect(model.riskBox?.endAt).toBe(now);
    expect(model.rewardBox?.endAt).toBe(now);
    expect(model.timeRange?.to).toBe(now);
    expect(value(model, 'result')?.value).toBeNull();
    expect(value(model, 'status')?.value).toBe('Open');
    expect(model.missing.map(item => item.part)).toEqual(expect.arrayContaining(['candles', 'result', 'actual-r']));
  });

  it('a draft with no start time gets no boxes but keeps its plan in the price range', () => {
    const model = projectTradePicture({ ...longInput, trade: trade({ status: 'draft', openedAt: null, closedAt: null }), executions: [], fees: [], candles: null });
    expect(model.riskBox).toBeNull();
    expect(model.rewardBox).toBeNull();
    expect(model.priceRange).toEqual({ low: '86.8', high: '133.2' });
    expect(model.missing.map(item => item.part)).toContain('start-time');
    expect(value(model, 'status')?.value).toBe('Planned');
  });
});
