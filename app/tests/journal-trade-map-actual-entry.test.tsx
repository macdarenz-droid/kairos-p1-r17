import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JournalTradeMap } from '../src/app/JournalTradeMap';
import type { JournalHistoryEntry } from '../src/application/journal';
import { createTradeDomainId, parseDecimalString, type TradeExecutionId, type TradeId } from '../src/domain/trades';

function dec(value: string) { const result = parseDecimalString(value); if (!result.ok) throw new Error('fixture decimal'); return result.value; }

function fixture(): JournalHistoryEntry {
  const tradeId = createTradeDomainId<TradeId>();
  return {
    trade: { id: tradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'open', source: 'manual', openedAt: '2026-09-13T00:00:00.000Z', closedAt: null, createdAt: '2026-09-13T00:00:00.000Z', updatedAt: '2026-09-13T00:05:00.000Z' },
    plans: [],
    executions: [
      { id: createTradeDomainId<TradeExecutionId>(), tradeId, type: 'entry', price: dec('0.00000120'), quantity: dec('0.5'), executedAt: '2026-09-13T00:01:00.000Z', createdAt: '2026-09-13T00:01:00.000Z' },
      { id: createTradeDomainId<TradeExecutionId>(), tradeId, type: 'entry', price: dec('0.00000125'), quantity: dec('0.75'), executedAt: '2026-09-13T00:05:00.000Z', createdAt: '2026-09-13T00:05:00.000Z' },
    ],
    fees: [], metrics: null, metricsError: null,
    visualPnl: { outcome: 'unavailable', label: 'Not available', amount: null, currency: null, source: 'none' },
  };
}

describe('P14.10 Journal Trade Map actual-entry truth', () => {
  it('shows each recorded entry price, quantity and exact time without inventing an exit', () => {
    const { container } = render(<JournalTradeMap entry={fixture()} />);
    const entries = container.querySelectorAll('.kairos-trade-map__levels [data-level-kind="executed-entry"]');
    expect(entries).toHaveLength(2);
    expect(within(entries[0] as HTMLElement).getByText('Actual entry 1')).toBeInTheDocument();
    expect(entries[0]).toHaveTextContent('0.00000120');
    expect(entries[0]).toHaveTextContent('Quantity 0.5');
    expect(within(entries[0] as HTMLElement).getByText('2026-09-13T00:01:00.000Z')).toHaveAttribute('datetime', '2026-09-13T00:01:00.000Z');
    expect(within(entries[1] as HTMLElement).getByText('Actual entry 2')).toBeInTheDocument();
    expect(entries[1]).toHaveTextContent('Quantity 0.75');
    expect(container.querySelectorAll('[data-level-kind="executed-entry"] [data-marker-shape="cross"]')).toHaveLength(2);
    expect(screen.queryByText(/Actual exit/)).not.toBeInTheDocument();
  });
});
