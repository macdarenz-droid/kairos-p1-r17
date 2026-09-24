import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JournalTradeMap } from '../src/app/JournalTradeMap';
import type { JournalHistoryEntry } from '../src/application/journal';
import {
  createTradeDomainId,
  parseDecimalString,
  type TradeExecutionId,
  type TradeId,
  type TradePlanId,
} from '../src/domain/trades';

function dec(value: string) {
  const result = parseDecimalString(value);
  if (!result.ok) throw new Error(`Invalid fixture decimal: ${value}`);
  return result.value;
}

function fixture(): JournalHistoryEntry {
  const tradeId = createTradeDomainId<TradeId>();
  return {
    trade: {
      id: tradeId,
      symbol: 'SOLUSDT',
      marketType: 'crypto',
      side: 'long',
      status: 'closed',
      source: 'manual',
      openedAt: '2026-09-01T00:00:00Z',
      closedAt: '2026-09-01T02:00:00Z',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T02:00:00Z',
    },
    plans: [{
      id: createTradeDomainId<TradePlanId>(),
      tradeId,
      plannedEntryPrice: dec('140.25'),
      plannedStopPrice: dec('135.00'),
      plannedTargetPrice: dec('150.50'),
      plannedQuantity: dec('2'),
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    }],
    executions: [
      {
        id: createTradeDomainId<TradeExecutionId>(),
        tradeId,
        type: 'exit',
        price: dec('148.50'),
        quantity: dec('1'),
        executedAt: '2026-09-01T01:30:00Z',
        createdAt: '2026-09-01T01:30:00Z',
      },
      {
        id: createTradeDomainId<TradeExecutionId>(),
        tradeId,
        type: 'exit',
        price: dec('149.75'),
        quantity: dec('1'),
        executedAt: '2026-09-01T02:00:00Z',
        createdAt: '2026-09-01T02:00:00Z',
      },
    ],
    fees: [],
    metrics: null,
    metricsError: null,
    visualPnl: { outcome: 'unavailable', label: 'Not available', amount: null, currency: null, source: 'none' },
  };
}

describe('P14.7 Journal Trade Map actual-exit execution time', () => {
  it('shows exact authoritative execution timestamps only for actual exits', () => {
    const { container } = render(<JournalTradeMap entry={fixture()} />);

    const exitRows = container.querySelectorAll('.kairos-trade-map__levels [data-level-kind="executed-exit"]');
    expect(exitRows).toHaveLength(2);
    expect(within(exitRows[0] as HTMLElement).getByText('148.50')).toBeInTheDocument();
    expect(within(exitRows[0] as HTMLElement).getByText('2026-09-01T01:30:00Z')).toHaveAttribute('datetime', '2026-09-01T01:30:00Z');
    expect(within(exitRows[1] as HTMLElement).getByText('149.75')).toBeInTheDocument();
    expect(within(exitRows[1] as HTMLElement).getByText('2026-09-01T02:00:00Z')).toHaveAttribute('datetime', '2026-09-01T02:00:00Z');

    const plannedRows = container.querySelectorAll('.kairos-trade-map__levels [data-level-kind^="planned-"]');
    plannedRows.forEach((row) => expect(row.querySelector('time')).toBeNull());
    expect(screen.getByText('Visual guide · Not to scale')).toBeInTheDocument();
  });
});
