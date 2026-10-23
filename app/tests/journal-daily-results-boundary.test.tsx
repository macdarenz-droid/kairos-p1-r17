import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { readVisualPnlTimeZonePreference, writeVisualPnlTimeZonePreference, type VisualPnlPeriodChoice } from '../src/application/visual-pnl';
import { createTradeDomainId, type TradeId } from '../src/domain/trades';
import { ResultsDashboard } from '../src/features/results/ResultsDashboard';

const names = new Set<string>();

function dbName(label: string): string {
  const name = `kairos-p1311r1-${label}-${crypto.randomUUID()}`;
  names.add(name);
  return name;
}

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
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

/** "Your results" for real trades, with the default month (T-051e: the Journal hands its results to Analysis). */
function Results({ db, now }: { readonly db: KairosDatabase; readonly now?: () => string }) {
  const [choice, setChoice] = useState<VisualPnlPeriodChoice>({ kind: 'month', at: null });
  return <ResultsDashboard db={db} scope="real" choice={choice} onChoiceChange={setChoice} renderTradeLink={() => null} refreshRevision={0} {...(now ? { now } : {})} />;
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
  it('without a saved zone and with none from the device, it asks and saves nothing', async () => {
    const real = new Intl.DateTimeFormat().resolvedOptions();
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ ...real, timeZone: '' });
    const { db, repositories } = await openFixture('unconfigured');
    await putClosedTrade(repositories, '2026-09-02T14:30:00.000Z');

    render(<Results db={db} />);

    expect(await screen.findByRole('heading', { name: 'Choose your time zone' })).toBeInTheDocument();
    expect(await readVisualPnlTimeZonePreference(repositories.metadata)).toBeNull();
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

    render(<Results db={db} now={() => '2026-09-10T00:00:00.000Z'} />);

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

    render(<Results db={db} now={() => '2026-09-10T00:00:00.000Z'} />);

    expect((await screen.findByText('Time zone: UTC')).closest('section')!.querySelector('[data-day-key="2026-09-02"]')).toHaveAttribute('data-day-result', 'unavailable');
    expect(document.querySelector('[data-day-key="2026-09-03"]')).toHaveAttribute('data-day-result', 'no-trades');
    expect(screen.getByText('Time zone: UTC')).toBeInTheDocument();
    db.close();
  });
});
