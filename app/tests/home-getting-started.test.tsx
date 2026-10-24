import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeRoute } from '../src/app/HomeRoute';
import { saveHomeCurrency } from '../src/application/currency/homeCurrency';
import { saveDisciplineLists } from '../src/application/discipline/disciplineListsPreference';
import { saveGoalsPreference } from '../src/application/goals/goalsPreference';
import { loadSetupState, skipSetup } from '../src/application/setup/setupState';
import { saveTradedMarkets } from '../src/application/setup/tradedMarkets';
import { saveManualTrade } from '../src/application/trades';
import { saveVisualPnlTimeZone } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { KAIROS_DEFAULT_DISCIPLINE_LISTS } from '../src/domain/discipline/disciplineLists';

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => null,
}));
// Each read of the steps is kept, so a test can wait for it before it says the card is not there.
const reads = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock('../src/application/setup/gettingStarted', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/application/setup/gettingStarted')>();
  return { ...actual, loadGettingStarted: (db: KairosDatabase) => { const read = actual.loadGettingStarted(db); reads.push(read); return read; } };
});

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); reads.splice(0); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
const now = () => '2026-10-23T10:00:00.000Z';
/** A journal whose setup was skipped, so Home stays Home. */
async function database(): Promise<KairosDatabase> {
  const name = `kairos-home-getting-started-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  await skipSetup(db, { now });
  return db;
}
function home(db: KairosDatabase) {
  render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <HomeRoute db={db} now={now} /> }], { initialEntries: ['/'] })} />);
}
const card = () => screen.findByRole('region', { name: 'Getting started' });
async function expectNoCard(): Promise<void> {
  await waitFor(() => expect(reads.length).toBeGreaterThan(0));
  await act(async () => { await Promise.all(reads); });
  expect(screen.queryByRole('region', { name: 'Getting started' })).toBeNull();
}

describe('T-053e Getting started on Home', () => {
  it('shows how many steps are done, ticks the done ones and links each open one to where it is done', async () => {
    const db = await database();
    await saveVisualPnlTimeZone(db, 'Asia/Manila', { now });
    await saveTradedMarkets(db, ['crypto'], { now });
    home(db);
    const section = within(await card());
    expect(section.getByText('2 of 6 done')).toBeInTheDocument();
    expect(section.getByText('Your time zone')).toHaveTextContent('Your time zone (done)');
    expect(section.getByText('What you trade')).toHaveTextContent('What you trade (done)');
    expect(section.queryByRole('link', { name: 'Your time zone' })).toBeNull();
    expect(section.getAllByRole('link').map(link => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Your home currency', '/setup?step=2'], ['Your checklist', '/setup?step=4'], ['Your first goal', '/setup?step=5'], ['Your first trade', '/journal/log'],
    ]);
    // It sits above the dashboard control.
    const control = screen.getByRole('group', { name: 'Dashboard view' });
    expect(screen.getByRole('region', { name: 'Getting started' }).compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('"Hide" saves, takes the card away and moves focus to the dashboard control', async () => {
    const db = await database();
    home(db);
    const section = within(await card());
    fireEvent.click(section.getByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Getting started' })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Live Market' }));
    expect((await loadSetupState(db)).cardHiddenAt).toBe(now());
    cleanup();
    reads.splice(0);
    home(db);
    await expectNoCard();
  });

  it('is gone once all six steps are done', async () => {
    const db = await database();
    await saveVisualPnlTimeZone(db, 'Asia/Manila', { now });
    await saveHomeCurrency(db, { currency: 'USD', usdStablecoins: [] }, { now });
    await saveTradedMarkets(db, ['crypto'], { now });
    await saveDisciplineLists(db, KAIROS_DEFAULT_DISCIPLINE_LISTS, { now });
    await saveGoalsPreference(db, { tradesPerMonthTarget: '20' }, { now });
    home(db);
    expect(within(await card()).getByText('5 of 6 done')).toBeInTheDocument();
    cleanup();
    reads.splice(0);
    await saveManualTrade(db, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt: '2026-10-20T08:00:00.000Z' }, { now });
    home(db);
    await expectNoCard();
  });
});
