import { describe, expect, it } from 'vitest';
import type {
  DecimalString,
  TradeExecutionId,
  TradeExecutionRecord,
  TradeId,
} from '../src/domain/trades';
import { aggregateTradeExecutions } from '../src/domain/calculations';

function execution(
  id: string,
  type: 'entry' | 'exit',
  price: string,
  quantity: string,
): TradeExecutionRecord {
  return {
    id: id as TradeExecutionId,
    tradeId: 'trade-1' as TradeId,
    type,
    price: price as DecimalString,
    quantity: quantity as DecimalString,
    executedAt: '2026-09-01T00:00:00.000Z',
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

describe('P11.2 execution aggregation', () => {
  it('represents missing executions without inventing an average price', () => {
    expect(aggregateTradeExecutions([])).toEqual({
      ok: true,
      value: {
        entry: { quantity: '0', notional: '0', weightedAveragePrice: null },
        exit: { quantity: '0', notional: '0', weightedAveragePrice: null },
        netQuantity: '0',
      },
    });
  });

  it('aggregates a single entry exactly', () => {
    expect(aggregateTradeExecutions([
      execution('e1', 'entry', '100.25', '2'),
    ])).toEqual({
      ok: true,
      value: {
        entry: { quantity: '2', notional: '200.5', weightedAveragePrice: '100.25' },
        exit: { quantity: '0', notional: '0', weightedAveragePrice: null },
        netQuantity: '2',
      },
    });
  });

  it('calculates quantity-weighted entry price without Number arithmetic', () => {
    const result = aggregateTradeExecutions([
      execution('e1', 'entry', '100', '1'),
      execution('e2', 'entry', '110', '3'),
    ]);
    expect(result).toEqual({
      ok: true,
      value: {
        entry: { quantity: '4', notional: '430', weightedAveragePrice: '107.5' },
        exit: { quantity: '0', notional: '0', weightedAveragePrice: null },
        netQuantity: '4',
      },
    });
  });

  it('keeps entry and exit evidence separate for partial exits', () => {
    const result = aggregateTradeExecutions([
      execution('e1', 'entry', '10', '3'),
      execution('x1', 'exit', '12', '1.5'),
    ]);
    expect(result).toEqual({
      ok: true,
      value: {
        entry: { quantity: '3', notional: '30', weightedAveragePrice: '10' },
        exit: { quantity: '1.5', notional: '18', weightedAveragePrice: '12' },
        netQuantity: '1.5',
      },
    });
  });

  it('preserves decimal precision for fractional fills', () => {
    const result = aggregateTradeExecutions([
      execution('e1', 'entry', '0.1', '0.2'),
      execution('e2', 'entry', '0.2', '0.1'),
    ]);
    expect(result).toEqual({
      ok: true,
      value: {
        entry: {
          quantity: '0.3',
          notional: '0.04',
          weightedAveragePrice: '0.1333333333333333333333333333333333333333',
        },
        exit: { quantity: '0', notional: '0', weightedAveragePrice: null },
        netQuantity: '0.3',
      },
    });
  });

  it('does not reinterpret negative net quantity as a valid open-position state', () => {
    const result = aggregateTradeExecutions([
      execution('e1', 'entry', '10', '1'),
      execution('x1', 'exit', '12', '2'),
    ]);
    expect(result).toEqual({
      ok: true,
      value: {
        entry: { quantity: '1', notional: '10', weightedAveragePrice: '10' },
        exit: { quantity: '2', notional: '24', weightedAveragePrice: '12' },
        netQuantity: '-1',
      },
    });
  });
});
