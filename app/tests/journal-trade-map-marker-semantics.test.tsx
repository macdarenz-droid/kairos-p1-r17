import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JournalTradeMap } from '../src/app/JournalTradeMap';
import {
  createTradeDomainId,
  parseDecimalString,
  type TradeExecutionId,
  type TradeId,
  type TradePlanId,
} from '../src/domain/trades';
import type { JournalHistoryEntry } from '../src/application/journal';

function dec(value: string) {
  const result = parseDecimalString(value);
  if (!result.ok) throw new Error('fixture decimal');
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
      openedAt: '2026-09-03T00:00:00.000Z',
      closedAt: '2026-09-03T01:00:00.000Z',
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T01:00:00.000Z',
    },
    plans: [{
      id: createTradeDomainId<TradePlanId>(),
      tradeId,
      plannedEntryPrice: dec('140.25'),
      plannedStopPrice: dec('135.00'),
      plannedTargetPrice: dec('150.50'),
      plannedQuantity: dec('2'),
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
    }],
    executions: [{
      id: createTradeDomainId<TradeExecutionId>(),
      tradeId,
      type: 'exit',
      price: dec('149.75'),
      quantity: dec('2'),
      executedAt: '2026-09-03T01:00:00.000Z',
      createdAt: '2026-09-03T01:00:00.000Z',
    }],
    fees: [],
    metrics: null,
    metricsError: null,
    visualPnl: { outcome: 'unavailable', label: 'Not available', amount: null, currency: null, source: 'none' },
  };
}

describe('P14.6 Journal Trade Map marker semantics', () => {
  it('uses distinct non-color marker shapes while preserving exact authoritative HTML facts', () => {
    const { container } = render(<JournalTradeMap entry={fixture()} />);

    expect(screen.getByRole('img', { name: /^SOLUSDT trade map visual\b/ })).toBeInTheDocument();
    expect(container.querySelector('[data-level-kind="planned-entry"] [data-marker-shape="circle"]')).not.toBeNull();
    expect(container.querySelector('[data-level-kind="planned-stop"] [data-marker-shape="square"]')).not.toBeNull();
    expect(container.querySelector('[data-level-kind="planned-target"] [data-marker-shape="triangle"]')).not.toBeNull();
    expect(container.querySelector('[data-level-kind="executed-exit"] [data-marker-shape="diamond"]')).not.toBeNull();

    expect(screen.getByText('140.25')).toBeInTheDocument();
    expect(screen.getByText('135.00')).toBeInTheDocument();
    expect(screen.getByText('150.50')).toBeInTheDocument();
    expect(screen.getByText('149.75')).toBeInTheDocument();
    expect(screen.getByText('Visual guide · Not to scale')).toBeInTheDocument();
  });
});
