import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppShellRoute } from '../src/app/AppShell';
import { HomeRoute } from '../src/app/HomeRoute';
import { skipSetup } from '../src/application/setup/setupState';
import { saveTradedMarkets } from '../src/application/setup/tradedMarkets';
import { saveManualTrade } from '../src/application/trades';
import { loadVisualPnlTimeZone, saveVisualPnlTimeZone } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { readDeviceTimeZone } from '../src/features/settings/DeviceTimeZoneButton';

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => null,
}));

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-first-run-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  return db;
}
const now = () => '2026-10-23T10:00:00.000Z';
beforeAll(async () => { await import('../src/app/JournalRoute'); }, 30_000);

function home(db: KairosDatabase) {
  const router = createMemoryRouter([
    { path: '/', element: <HomeRoute db={db} now={now} /> },
    { path: '/setup', element: <p>Setup page</p> },
  ], { initialEntries: ['/'] });
  render(<RouterProvider router={router} />);
  return router;
}

describe('T-053d the first run', () => {
  it('Home opens the setup in its place on a fresh journal, without a history entry', async () => {
    const db = await database();
    const router = home(db);
    await screen.findByText('Setup page');
    expect(router.state.location.pathname).toBe('/setup');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('Home stays Home once the setup was skipped, or when the journal has a trade', async () => {
    const skipped = await database();
    await skipSetup(skipped, { now });
    home(skipped);
    expect(await screen.findByRole('group', { name: 'Dashboard view' })).toBeInTheDocument();
    expect(screen.queryByText('Setup page')).toBeNull();
    cleanup();
    const trading = await database();
    await saveManualTrade(trading, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt: '2026-10-20T08:00:00.000Z' });
    home(trading);
    expect(await screen.findByRole('group', { name: 'Dashboard view' })).toBeInTheDocument();
  });

  it('Home opens on "Your Trades" for a trader who does not trade crypto, and on Live Market otherwise', async () => {
    const forex = await database();
    await skipSetup(forex, { now });
    await saveTradedMarkets(forex, ['forex'], { now });
    home(forex);
    await screen.findByRole('group', { name: 'Dashboard view' });
    expect(screen.getByRole('button', { name: 'Your Trades' })).toHaveAttribute('aria-pressed', 'true');
    cleanup();
    const crypto = await database();
    await skipSetup(crypto, { now });
    await saveTradedMarkets(crypto, ['crypto', 'forex'], { now });
    home(crypto);
    await screen.findByRole('group', { name: 'Dashboard view' });
    expect(screen.getByRole('button', { name: 'Live Market' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('the Journal\'s trade form starts on the first market you trade', async () => {
    const db = await database();
    await saveTradedMarkets(db, ['stock', 'forex'], { now });
    const { JournalRoute } = await import('../src/app/JournalRoute');
    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText(/^Market/)).toHaveValue('forex'));
  });

  it('the shell saves this phone\'s time zone once, and never over a saved one', async () => {
    const fresh = await database();
    const shell = (db: KairosDatabase) => render(<RouterProvider router={createMemoryRouter([{ element: <AppShellRoute db={db} now={now} />, children: [{ path: '/', element: <h1>Start</h1> }] }], { initialEntries: ['/'] })} />);
    shell(fresh);
    await waitFor(async () => expect(await loadVisualPnlTimeZone(fresh)).toBe(readDeviceTimeZone()));
    cleanup();
    const saved = await database();
    await saveVisualPnlTimeZone(saved, 'Europe/Lisbon', { now });
    shell(saved);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(await loadVisualPnlTimeZone(saved)).toBe('Europe/Lisbon');
  });
});
