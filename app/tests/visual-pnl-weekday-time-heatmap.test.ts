import { describe, expect, it } from 'vitest';
import type { JournalHistoryEntry } from '../src/application/journal/historyQuery';
import { projectVisualPnlOpening, projectVisualPnlWeekdayTimeHeatmap, type VisualPnlOutcomeProjection } from '../src/application/visual-pnl';
import { parseDecimalString, type TradeRecord } from '../src/domain/trades';

function visual(amount: string | null, currency = 'USDT'): VisualPnlOutcomeProjection {
  if (amount === null) return Object.freeze({ outcome: 'unavailable', label: 'Not available', amount: null, currency: null, source: 'none' });
  const parsed = parseDecimalString(amount);
  if (!parsed.ok) throw new Error(`fixture ${amount}`);
  const outcome = amount.startsWith('-') ? 'loss' : amount === '0' ? 'breakeven' : 'profit';
  return Object.freeze({ outcome, label: 'Profit', amount: parsed.value, currency, source: 'net-pnl' }) as VisualPnlOutcomeProjection;
}
let ids = 0;
function entry(openedAt: string | null, pnl: VisualPnlOutcomeProjection): JournalHistoryEntry {
  return {
    trade: { id: `t-${++ids}`, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', openedAt, closedAt: '2026-09-30T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' } as TradeRecord,
    plans: [], executions: [], fees: [], metrics: null, metricsError: null, visualPnl: pnl,
  };
}
// 7 September 2026 is a Monday; 11 September a Friday.
const week = () => [entry('2026-09-07T09:30:00.000Z', visual('10')), entry('2026-09-07T10:15:00.000Z', visual('-4')), entry('2026-09-11T21:00:00.000Z', visual('5'))];
const totalOf = (summary: { available: boolean; total?: string | null; reason?: string } | null) => summary === null ? null : summary.available ? summary.total : summary.reason;

describe('T-051j when you trade: weekday × time of day', () => {
  it('reads when a trade opened in the saved zone, Monday first', () => {
    expect(projectVisualPnlOpening('2026-09-07T09:30:00.000Z', 'UTC')).toEqual({ weekday: 0, hour: 9 });
    expect(projectVisualPnlOpening(null, 'UTC')).toBeNull();
    expect(projectVisualPnlOpening('not a time', 'UTC')).toBeNull();
  });

  it('puts each trade in its weekday and 4-hour block', () => {
    const entries = week();
    const heatmap = projectVisualPnlWeekdayTimeHeatmap(entries, 'UTC');
    expect(heatmap.rows).toHaveLength(7);
    expect(heatmap.rows.every(row => row.cells.length === 6)).toBe(true);
    const monday = heatmap.rows[0]!.cells[2]!;
    expect(monday.tradeIds).toEqual([entries[0]!.trade.id, entries[1]!.trade.id]);
    expect(monday.summary).toMatchObject({ available: true, total: '6', tradeCount: 2, outcome: 'profit' });
    expect(heatmap.rows[4]!.cells[5]!.tradeIds).toEqual([entries[2]!.trade.id]);
    const filled = heatmap.rows.flatMap(row => row.cells).filter(cell => cell.summary !== null);
    expect(filled).toHaveLength(2);
    expect(heatmap.leftOut).toEqual([]);
    expect(Object.isFrozen(heatmap) && Object.isFrozen(heatmap.rows[0]) && Object.isFrozen(monday) && Object.isFrozen(monday.tradeIds)).toBe(true);
  });

  it('follows the saved zone: Friday 21:00 UTC is Saturday 06:00 in Tokyo', () => {
    const entries = week();
    const heatmap = projectVisualPnlWeekdayTimeHeatmap(entries, 'Asia/Tokyo');
    expect(heatmap.rows[5]!.cells[1]!.tradeIds).toEqual([entries[2]!.trade.id]);
    expect(heatmap.rows[4]!.cells[5]!.summary).toBeNull();
  });

  it('leaves out a trade with no opening time', () => {
    const missing = entry(null, visual('3'));
    const heatmap = projectVisualPnlWeekdayTimeHeatmap([...week(), missing], 'UTC');
    expect(heatmap.leftOut).toEqual([missing.trade.id]);
  });

  it('makes a cell with a no-result trade unavailable, and keeps the others', () => {
    const heatmap = projectVisualPnlWeekdayTimeHeatmap([...week(), entry('2026-09-07T11:00:00.000Z', visual(null))], 'UTC');
    expect(totalOf(heatmap.rows[0]!.cells[2]!.summary)).toBe('unavailable-trade-outcome');
    expect(heatmap.rows[0]!.cells[2]!.strength).toBeNull();
    expect(totalOf(heatmap.rows[4]!.cells[5]!.summary)).toBe('5');
  });

  it('colours each cell against the largest cell', () => {
    const heatmap = projectVisualPnlWeekdayTimeHeatmap([...week(), entry('2026-09-09T14:00:00.000Z', visual('-24'))], 'UTC');
    expect(heatmap.scale).toMatchObject({ kind: 'one-currency', currency: 'USDT', largestAbsolute: '24' });
    // 24 is the largest; 6 is 1 of 4 steps; 5 rounds to 1.
    expect([heatmap.rows[2]!.cells[3]!.strength, heatmap.rows[0]!.cells[2]!.strength, heatmap.rows[4]!.cells[5]!.strength]).toEqual([4, 1, 1]);
  });
});
