import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { JournalRoute } from '../src/app/JournalRoute';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createTradeDomainId, type TradeId, type TradeRecord, type TradeStatus } from '../src/domain/trades';

const HEAVY_TRADE_COUNT = 10_500;
const HISTORY_PAGE_LIMIT = 100;
const INITIAL_RENDER_BUDGET_MS = 5_000;
const STATUS_FILTER_BUDGET_MS = 3_000;
const names = new Set<string>();

function dbName(): string {
  const value = `kairos-p126r1-${crypto.randomUUID()}`;
  names.add(value);
  return value;
}

function heavyTrades(): TradeRecord[] {
  const statuses: readonly TradeStatus[] = ['draft', 'open', 'closed', 'cancelled'];
  const base = Date.parse('2026-01-01T00:00:00.000Z');
  return Array.from({ length: HEAVY_TRADE_COUNT }, (_, index) => {
    const status = statuses[index % statuses.length];
    const updatedAt = new Date(base + index * 1_000).toISOString();
    const openedAt = status === 'open' || status === 'closed' ? updatedAt : null;
    const closedAt = status === 'closed' ? new Date(base + index * 1_000 + 500).toISOString() : null;
    return {
      id: createTradeDomainId<TradeId>(),
      symbol: `HVY${String(index).padStart(5, '0')}`,
      marketType: 'crypto',
      side: index % 2 === 0 ? 'long' : 'short',
      status,
      source: 'manual',
      openedAt,
      closedAt,
      createdAt: updatedAt,
      updatedAt,
    };
  });
}

async function deleteDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`Database ${name} remained blocked during cleanup.`));
  });
}

afterEach(async () => {
  for (const name of names) await deleteDatabase(name);
  names.clear();
});

describe('P12.6R1 journal history USER_HEAVY performance canary', () => {
  it('keeps 10,500-trade initial history and status filtering bounded to indexed 100-row windows', async () => {
    const db = createKairosDatabase(dbName());
    await openKairosDatabase(db);
    await db.trades.bulkPut(heavyTrades());

    const initialStartedAt = performance.now();
    render(<JournalRoute db={db} />);
    await waitFor(() => expect(screen.getByText(`${HISTORY_PAGE_LIMIT} shown`)).toBeInTheDocument());
    const initialElapsedMs = performance.now() - initialStartedAt;

    expect(screen.getAllByRole('listitem')).toHaveLength(HISTORY_PAGE_LIMIT);
    expect(initialElapsedMs).toBeLessThan(INITIAL_RENDER_BUDGET_MS);

    const filter = screen.getByLabelText('Show trades');
    const filterStartedAt = performance.now();
    fireEvent.change(filter, { target: { value: 'closed' } });
    await waitFor(() => {
      expect(filter).toHaveValue('closed');
      expect(screen.getByText(`${HISTORY_PAGE_LIMIT} shown`)).toBeInTheDocument();
      const closedRows = screen.getAllByRole('listitem');
      expect(closedRows).toHaveLength(HISTORY_PAGE_LIMIT);
      for (const row of closedRows) expect(row).toHaveTextContent('Closed');
    });
    const filterElapsedMs = performance.now() - filterStartedAt;

    expect(filterElapsedMs).toBeLessThan(STATUS_FILTER_BUDGET_MS);
    db.close();
  }, 20_000);
});
