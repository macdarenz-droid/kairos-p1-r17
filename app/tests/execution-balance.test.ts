import { describe, expect, it } from 'vitest';
import type {
  DecimalString,
  TradeExecutionId,
  TradeExecutionRecord,
  TradeId,
} from '../src/domain/trades';
import { assessExecutionBalance } from '../src/domain/calculations';

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

describe('P11.3 execution balance assessment', () => {
  it('classifies no execution evidence as empty', () => {
    const result = assessExecutionBalance([]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state).toBe('empty');
      expect(result.aggregate.netQuantity).toBe('0');
    }
  });

  it('classifies entry-only evidence as open', () => {
    const result = assessExecutionBalance([
      execution('e1', 'entry', '100', '2'),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state).toBe('open');
      expect(result.aggregate.netQuantity).toBe('2');
    }
  });

  it('classifies partial exits without inventing closure', () => {
    const result = assessExecutionBalance([
      execution('e1', 'entry', '100', '3'),
      execution('x1', 'exit', '110', '1'),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state).toBe('partially-exited');
      expect(result.aggregate.netQuantity).toBe('2');
    }
  });

  it('classifies exactly balanced entry/exit quantities as flat', () => {
    const result = assessExecutionBalance([
      execution('e1', 'entry', '100', '1.5'),
      execution('x1', 'exit', '110', '1.5'),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state).toBe('flat');
      expect(result.aggregate.netQuantity).toBe('0');
    }
  });

  it('rejects exits when there is no entry evidence', () => {
    const result = assessExecutionBalance([
      execution('x1', 'exit', '110', '1'),
    ]);
    expect(result).toMatchObject({
      ok: false,
      reason: 'exit-without-entry',
    });
  });

  it('rejects exit quantity greater than total entry quantity', () => {
    const result = assessExecutionBalance([
      execution('e1', 'entry', '100', '1'),
      execution('x1', 'exit', '110', '1.0000000000000000001'),
    ]);
    expect(result).toMatchObject({
      ok: false,
      reason: 'over-exited',
    });
  });
});
