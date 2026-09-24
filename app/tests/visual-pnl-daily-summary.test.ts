import { describe, expect, it } from 'vitest';
import { summarizeVisualPnlByDay, type VisualPnlOutcomeProjection } from '../src/application/visual-pnl';
import { parseDecimalString, type TradeRecord } from '../src/domain/trades';
import type { JournalHistoryEntry } from '../src/application/journal';

function dec(value: string) {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error(`Invalid fixture decimal: ${value}`);
  return parsed.value;
}

function visual(outcome: 'profit' | 'loss', amount: string, currency: string): VisualPnlOutcomeProjection {
  return Object.freeze({
    outcome,
    label: outcome === 'profit' ? 'Profit' : 'Loss',
    amount: dec(amount),
    currency,
    source: 'net-pnl',
  });
}

function entry(id: string, closedAt: string | null, pnl: VisualPnlOutcomeProjection, status: TradeRecord['status'] = 'closed'): JournalHistoryEntry {
  return {
    trade: { id, symbol: 'TEST', marketType: 'stock', side: 'long', status, openedAt: status === 'closed' ? '2026-09-01T00:00:00.000Z' : null, closedAt, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' } as TradeRecord,
    plans: [], executions: [], fees: [], metrics: null, metricsError: null, visualPnl: pnl,
  };
}

describe('P13.7 Visual P&L daily summary composition', () => {
  it('groups same Sydney day and delegates exact same-currency aggregation', () => {
    const result = summarizeVisualPnlByDay([
      entry('a', '2026-09-02T14:30:00.000Z', visual('profit', '10.25', 'USD')),
      entry('b', '2026-09-02T15:30:00.000Z', visual('loss', '-3.1', 'USD')),
    ], 'Australia/Sydney');

    expect(result.days).toHaveLength(1);
    expect(result.days[0]).toEqual({
      dayKey: '2026-09-03',
      timeZone: 'Australia/Sydney',
      summary: { available: true, currency: 'USD', total: '7.15', outcome: 'profit', tradeCount: 2 },
    });
    expect(result.blockedTrades).toEqual([]);
  });

  it('keeps mixed-currency day explicitly unavailable instead of combining it', () => {
    const result = summarizeVisualPnlByDay([
      entry('a', '2026-09-02T14:30:00.000Z', visual('profit', '10', 'USD')),
      entry('b', '2026-09-02T15:30:00.000Z', visual('profit', '5', 'AUD')),
    ], 'Australia/Sydney');

    expect(result.days[0]?.summary).toMatchObject({ available: false, reason: 'mixed-currencies', tradeCount: 2 });
  });

  it('creates separate explicit calendar days in the requested zone', () => {
    const result = summarizeVisualPnlByDay([
      entry('a', '2026-09-02T13:30:00.000Z', visual('profit', '1', 'USD')),
      entry('b', '2026-09-02T14:30:00.000Z', visual('profit', '2', 'USD')),
    ], 'Australia/Sydney');

    expect(result.days.map((day) => day.dayKey)).toEqual(['2026-09-02', '2026-09-03']);
  });

  it('preserves non-closed trades as blocked evidence', () => {
    const result = summarizeVisualPnlByDay([
      entry('open-1', null, visual('profit', '1', 'USD'), 'open'),
    ], 'Australia/Sydney');

    expect(result.days).toEqual([]);
    expect(result.blockedTrades).toEqual([{ tradeId: 'open-1', reason: 'non-closed-trade' }]);
  });

  it('preserves invalid close-time evidence rather than dropping the trade silently', () => {
    const result = summarizeVisualPnlByDay([
      entry('bad-time', '2026-09-02 14:30:00', visual('profit', '1', 'USD')),
    ], 'Australia/Sydney');

    expect(result.days).toEqual([]);
    expect(result.blockedTrades).toEqual([{ tradeId: 'bad-time', reason: 'invalid-close-time' }]);
  });
});
