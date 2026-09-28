import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JournalRoute } from '../src/app/JournalRoute';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createTradeDomainId, type TradeId } from '../src/domain/trades';

const names = new Set<string>();

function dbName(label: string): string {
  const name = `kairos-p1311r1-${label}-${crypto.randomUUID()}`;
  names.add(name);
  return name;
}

afterEach(async () => {
  for (const name of names) {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('blocked'));
    });
  }
  names.clear();
});

async function openFixture(label: string) {
  const db = createKairosDatabase(dbName(label));
  await openKairosDatabase(db);
  return { db, repositories: createKairosRepositories(db) };
}

async function putClosedTrade(
  repositories: ReturnType<typeof createKairosRepositories>,
  closedAt: string,
): Promise<void> {
  await repositories.trades.put({
    id: createTradeDomainId<TradeId>(),
    symbol: 'ZONE',
    marketType: 'stock',
    side: 'long',
    status: 'closed',
    source: 'manual',
    openedAt: '2026-09-02T13:00:00.000Z',
    closedAt,
    createdAt: '2026-09-02T13:00:00.000Z',
    updatedAt: closedAt,
  });
}

describe('P13.11R1 Journal daily-results child boundary', () => {
  it('keeps missing timezone explicit rather than inferring the runtime zone', async () => {
    const { db, repositories } = await openFixture('unconfigured');
    await putClosedTrade(repositories, '2026-09-02T14:30:00.000Z');

    render(<JournalRoute db={db} />);

    expect(await screen.findByText('Choose a time zone in Settings to view daily results.')).toBeInTheDocument();
    expect(screen.queryByText('03/09/2026')).not.toBeInTheDocument();
    db.close();
  });

  it('uses persisted Australia/Sydney evidence through the child P13 boundary', async () => {
    const { db, repositories } = await openFixture('sydney');
    await writeVisualPnlTimeZonePreference(
      repositories.metadata,
      'Australia/Sydney',
      '2026-09-02T10:00:00.000Z',
    );
    await putClosedTrade(repositories, '2026-09-02T14:30:00.000Z');

    render(<JournalRoute db={db} now={() => '2026-09-10T00:00:00.000Z'} />);

    const sydneyDay = (await screen.findByText('Time zone: Australia/Sydney')).closest('section')!.querySelector('[data-day-key="2026-09-03"]') as HTMLElement;
    expect(screen.getByText('Time zone: Australia/Sydney')).toBeInTheDocument();
    expect(sydneyDay).toHaveAttribute('data-day-result', 'unavailable');
    expect(sydneyDay.querySelector('button')?.getAttribute('aria-label')).toContain('Result unavailable');
    db.close();
  });

  it('keeps UTC day attribution distinct through the same child boundary', async () => {
    const { db, repositories } = await openFixture('utc');
    await writeVisualPnlTimeZonePreference(
      repositories.metadata,
      'UTC',
      '2026-09-02T10:00:00.000Z',
    );
    await putClosedTrade(repositories, '2026-09-02T14:30:00.000Z');

    render(<JournalRoute db={db} now={() => '2026-09-10T00:00:00.000Z'} />);

    expect((await screen.findByText('Time zone: UTC')).closest('section')!.querySelector('[data-day-key="2026-09-02"]')).toHaveAttribute('data-day-result', 'unavailable');
    expect(document.querySelector('[data-day-key="2026-09-03"]')).toHaveAttribute('data-day-result', 'no-trades');
    expect(screen.getByText('Time zone: UTC')).toBeInTheDocument();
    db.close();
  });
});
