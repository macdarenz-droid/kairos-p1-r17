import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JournalTradeMap } from '../src/app/JournalTradeMap';
import { reviewTimestamp } from '../src/app/TradeReviewDetails';
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
      openedAt: '2026-09-03T00:00:00Z',
      closedAt: '2026-09-03T01:00:00Z',
      createdAt: '2026-09-03T00:00:00Z',
      updatedAt: '2026-09-03T01:00:00Z',
    },
    plans: [{
      id: createTradeDomainId<TradePlanId>(),
      tradeId,
      plannedEntryPrice: dec('140.25'),
      plannedStopPrice: dec('135.00'),
      plannedTargetPrice: dec('150.50'),
      plannedQuantity: dec('2'),
      createdAt: '2026-09-03T00:00:00Z',
      updatedAt: '2026-09-03T00:00:00Z',
    }],
    executions: [{
      id: createTradeDomainId<TradeExecutionId>(),
      tradeId,
      type: 'exit',
      price: dec('149.75'),
      quantity: dec('2'),
      executedAt: '2026-09-03T01:00:00Z',
      createdAt: '2026-09-03T01:00:00Z',
    }],
    fees: [],
    metrics: null,
    metricsError: null,
    visualPnl: { outcome: 'unavailable', label: 'Not available', amount: null, currency: null, source: 'none' },
  };
}

describe('P14.8 Journal Trade Map motion semantics', () => {
  it('keeps motion anchored to an already-authoritative actual exit without changing exact facts', () => {
    const { container } = render(<JournalTradeMap entry={fixture()} />);

    expect(container.querySelector('.kairos-trade-map__graphic [data-level-kind="executed-exit"]')).not.toBeNull();
    expect(container.querySelector('.kairos-trade-map__levels [data-level-kind="executed-exit"]')).not.toBeNull();
    expect(screen.getByText('149.75')).toBeInTheDocument();
    expect(screen.getByText(reviewTimestamp('2026-09-03T01:00:00Z'))).toHaveAttribute('datetime', '2026-09-03T01:00:00Z');
    expect(screen.getByText('Visual guide · Not to scale')).toBeInTheDocument();
  });
});
