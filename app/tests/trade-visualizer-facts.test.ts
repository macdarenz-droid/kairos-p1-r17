import { describe, expect, it } from 'vitest';
import { projectTradeVisualizerFacts } from '../src/application/trade-visualizer';
import {
  createTradeDomainId,
  parseDecimalString,
  type TradeExecutionId,
  type TradeExecutionRecord,
  type TradeId,
  type TradePlanId,
  type TradePlanRecord,
  type TradeRecord,
} from '../src/domain/trades';

function dec(v: string) {
  const r = parseDecimalString(v);
  if (!r.ok) throw new Error('bad fixture');
  return r.value;
}

const tradeId = createTradeDomainId<TradeId>();
const trade = {
  id: tradeId,
  symbol: 'BTCUSD',
  marketType: 'crypto',
  side: 'long',
  status: 'closed',
  source: 'manual',
  openedAt: '2026-09-01T00:00:00Z',
  closedAt: '2026-09-02T00:00:00Z',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-02T00:00:00Z',
} satisfies TradeRecord;

describe('P14.1R1 trade visualizer facts boundary', () => {
  it('keeps planned levels separate and exposes authoritative entry and exit executions', () => {
    const plan = {
      id: createTradeDomainId<TradePlanId>(),
      tradeId,
      plannedEntryPrice: dec('100'),
      plannedStopPrice: dec('90'),
      plannedTargetPrice: dec('120'),
      plannedQuantity: dec('2'),
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    } satisfies TradePlanRecord;

    const executions = [
      {
        id: createTradeDomainId<TradeExecutionId>(),
        tradeId,
        type: 'entry',
        price: dec('101'),
        quantity: dec('2'),
        executedAt: '2026-09-01T01:00:00Z',
        createdAt: '2026-09-01T01:00:00Z',
      },
      {
        id: createTradeDomainId<TradeExecutionId>(),
        tradeId,
        type: 'exit',
        price: dec('115'),
        quantity: dec('1'),
        executedAt: '2026-09-01T03:00:00Z',
        createdAt: '2026-09-01T03:00:00Z',
      },
      {
        id: createTradeDomainId<TradeExecutionId>(),
        tradeId,
        type: 'exit',
        price: dec('118'),
        quantity: dec('1'),
        executedAt: '2026-09-02T00:00:00Z',
        createdAt: '2026-09-02T00:00:00Z',
      },
    ] satisfies readonly TradeExecutionRecord[];

    const result = projectTradeVisualizerFacts(trade, [plan], executions);
    expect(result.planned).toEqual({ entry: dec('100'), stop: dec('90'), target: dec('120') });
    expect(result.executedEntries.map((x) => [x.executionId, x.price, x.quantity, x.executedAt])).toEqual([
      [executions[0].id, dec('101'), dec('2'), '2026-09-01T01:00:00Z'],
    ]);
    expect(result.executedExits.map((x) => x.price)).toEqual([dec('115'), dec('118')]);
  });

  it('does not invent an exit for an open trade', () => {
    const open = { ...trade, status: 'open', closedAt: null } satisfies TradeRecord;
    expect(projectTradeVisualizerFacts(open, [], []).executedEntries).toEqual([]);
    expect(projectTradeVisualizerFacts(open, [], []).executedExits).toEqual([]);
  });
});
