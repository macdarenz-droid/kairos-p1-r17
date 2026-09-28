// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createEmptyQuickTradeLogDraft, quickTradeLogFieldFor, quickTradeLogRows } from '../src/application/trades/quickTradeLog';

describe('quick trade log', () => {
  it('puts the entry at the opened time and the exit at the closed time, with the same quantity and untouched strings', () => {
    const rows = quickTradeLogRows({ entryPrice: ' 100.50', exitPrice: '120', quantity: '0.5 ' }, '2026-09-12T10:00', '2026-09-12T11:00');
    expect(rows).toEqual([
      { key: 'quick-entry', type: 'entry', price: ' 100.50', quantity: '0.5 ', executedAt: '2026-09-12T10:00' },
      { key: 'quick-exit', type: 'exit', price: '120', quantity: '0.5 ', executedAt: '2026-09-12T11:00' },
    ]);
    expect(createEmptyQuickTradeLogDraft()).toEqual({ entryPrice: '', exitPrice: '', quantity: '' });
  });

  it('maps save and prepare errors to the quick log fields', () => {
    expect(quickTradeLogFieldFor('executions.0.price')).toBe('entryPrice');
    expect(quickTradeLogFieldFor('executions.1.price')).toBe('exitPrice');
    expect(quickTradeLogFieldFor('executions.0.quantity')).toBe('quantity');
    expect(quickTradeLogFieldFor('executions.1.quantity')).toBe('quantity');
    expect(quickTradeLogFieldFor('executions.0.executedAt')).toBe('openedAt');
    expect(quickTradeLogFieldFor('executions.1.executedAt')).toBe('closedAt');
    expect(quickTradeLogFieldFor('symbol')).toBeNull();
    expect(quickTradeLogFieldFor('trade')).toBeNull();
    expect(quickTradeLogFieldFor(undefined)).toBeNull();
    expect(quickTradeLogFieldFor('toString')).toBeNull();
  });
});
