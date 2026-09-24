import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VisualPnlCalendar } from '../src/app/VisualPnlCalendar';
import { parseDecimalString, type DecimalString } from '../src/domain/trades';
import type { VisualPnlDailySummaryProjection } from '../src/application/visual-pnl';

function dec(value: string): DecimalString {
  const result = parseDecimalString(value);
  if (!result.ok) throw new Error('fixture decimal');
  return result.value;
}

describe('P13.9 accessible Visual P&L calendar presentation contract', () => {
  it.each([
    ['profit', 'Profit', '▲', '12.5 USD'],
    ['loss', 'Loss', '▼', '-4 USD'],
    ['breakeven', 'Break-even', '—', '0 USD'],
  ] as const)('renders %s with text and shape cues in addition to semantic color', (outcome, label, mark, amount) => {
    const projection: VisualPnlDailySummaryProjection = {
      days: [{
        dayKey: '2026-09-02',
        timeZone: 'UTC',
        summary: { available: true, currency: 'USD', total: dec(amount.split(' ')[0]), outcome, tradeCount: 2 },
      }],
      blockedTrades: [],
    };
    const { container } = render(<VisualPnlCalendar projection={projection} />);
    const cell = container.querySelector(`[data-day-outcome="${outcome}"]`);
    expect(cell).toHaveTextContent(label);
    expect(cell).toHaveTextContent(mark);
    expect(cell).toHaveTextContent(amount);
    expect(cell).toHaveTextContent('2 trades');
    expect(cell).toHaveTextContent('02/09/2026');
  });

  it('keeps mixed-currency daily aggregation explicitly unavailable', () => {
    const projection: VisualPnlDailySummaryProjection = {
      days: [{
        dayKey: '2026-09-02',
        timeZone: 'UTC',
        summary: { available: false, currency: null, total: null, outcome: null, tradeCount: 2, reason: 'mixed-currencies' },
      }],
      blockedTrades: [],
    };
    render(<VisualPnlCalendar projection={projection} />);
    expect(screen.getByText('Mixed currencies')).toBeInTheDocument();
    expect(screen.getByText('Not available')).toBeInTheDocument();
  });

  it('shows an empty state and explicit blocked-trade count without inventing a result', () => {
    const projection: VisualPnlDailySummaryProjection = {
      days: [],
      blockedTrades: [{ tradeId: 'blocked' as never, reason: 'invalid-close-time' }],
    };
    render(<VisualPnlCalendar projection={projection} />);
    expect(screen.getByText('No closed-trade daily results to show yet.')).toBeInTheDocument();
    expect(screen.getByText('1 trade is not assigned to a daily result.')).toBeInTheDocument();
  });
});
