import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JournalHistoryList } from '../src/app/JournalHistoryList';
import type { JournalHistoryEntry } from '../src/application/journal';

function entry(outcome: JournalHistoryEntry['visualPnl']): JournalHistoryEntry {
  return {
    trade: { id:'trade-p133' as never, symbol:'BTCUSD', marketType:'crypto', side:'long', status:'closed', source:'manual', openedAt:'2026-09-02T01:00:00.000Z', closedAt:'2026-09-02T02:00:00.000Z', createdAt:'2026-09-02T01:00:00.000Z', updatedAt:'2026-09-02T02:00:00.000Z' },
    plans: [], executions: [], fees: [], metrics: null, metricsError: null, visualPnl: outcome,
  };
}

const noop = () => undefined;

describe('P13.3 Journal Visual P&L presentation', () => {
  it('renders profit with semantic text, a non-color shape cue, amount, currency and theme token class', () => {
    render(<JournalHistoryList entries={[entry({outcome:'profit',label:'Profit',amount:'10' as never,currency:'USD',source:'net-pnl'})]} isLoading={false} errorMessage={null} statusFilter="" onStatusFilterChange={noop} />);
    const outcome=screen.getByText('Profit').closest('[data-outcome]');
    expect(outcome).toHaveAttribute('data-outcome','profit');
    expect(outcome).toHaveClass('kairos-history-card__outcome--profit');
    expect(outcome).toHaveTextContent('▲');
    expect(outcome).toHaveTextContent('10 USD');
  });

  it.each([
    ['loss','Loss','▼','-4'],
    ['breakeven','Break-even','—','0'],
    ['unavailable','Not available','·','Not available'],
  ] as const)('keeps %s understandable without relying on color', (kind,label,mark,amount) => {
    const projection = kind === 'unavailable'
      ? {outcome:kind,label,amount:null,currency:null,source:'none' as const}
      : {outcome:kind,label,amount:amount as never,currency:null,source:'net-pnl' as const};
    const { container } = render(<JournalHistoryList entries={[entry(projection)]} isLoading={false} errorMessage={null} statusFilter="" onStatusFilterChange={noop} />);
    const outcome = container.querySelector(`[data-outcome="${kind}"]`);
    expect(outcome).toHaveTextContent(label);
    expect(outcome).toHaveAttribute('data-outcome',kind);
    expect(outcome).toHaveTextContent(mark);
    expect(outcome).toHaveTextContent(amount);
  });
});
