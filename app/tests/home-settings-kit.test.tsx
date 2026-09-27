import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => <p>market runtime</p>,
}));
import { HomeRoute } from '../src/app/HomeRoute';
import { HomeDashboardYourTrades } from '../src/app/HomeDashboardYourTrades';
import { SettingsRoute } from '../src/app/SettingsRoute';
import type { HomeYourTrade } from '../src/application/dashboard/homeDashboardYourTradesQuery';
import { loadDisciplineLists } from '../src/application/discipline';
import { visualPnlTimeZonePreferenceMetadataKey, writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { ToastProvider } from '../src/design-system/primitives';
import { ThemeProvider } from '../src/design-system/themes';
import { KAIROS_DEFAULT_DISCIPLINE_LISTS } from '../src/domain/discipline';
import { axeViolations } from './fixtures/axe';

const names: string[] = [];
async function database(): Promise<KairosDatabase> {
  const name = `kairos-home-settings-kit-${crypto.randomUUID()}`;
  names.push(name);
  const db = createKairosDatabase(name);
  await openKairosDatabase(db);
  return db;
}
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const trade: HomeYourTrade = { id: 't1', symbol: 'BTCUSDT', side: 'long', status: 'closed', outcome: 'profit', resultLabel: 'Profit', amount: '40', currency: null, source: 'net-pnl', timestamp: '2026-09-12T01:00:00Z' };

describe('T-049f Home on the kit', () => {
  it('has a level-1 heading with its intro, and a "Dashboard view" switch that shows Your Trades', async () => {
    const db = await database();
    render(<MemoryRouter><HomeRoute db={db} /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
    expect(screen.getByText('Your markets and your trades at a glance.')).toBeInTheDocument();
    const view = screen.getByRole('group', { name: 'Dashboard view' });
    const options = within(view).getAllByRole('button');
    expect(options.map(option => option.textContent)).toEqual(['Live Market', 'Your Trades']);
    expect(options.filter(option => option.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Crypto prices now' })).toBeInTheDocument();
    expect(await axeViolations(document.body)).toEqual([]);
    fireEvent.click(within(view).getByRole('button', { name: 'Your Trades' }));
    expect(within(view).getByRole('button', { name: 'Your Trades' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Your Trades' })).toBeInTheDocument();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('Your Trades: loading, an error with "Try again" that loads again, and an empty state that links to the journal', async () => {
    let finish: (rows: readonly HomeYourTrade[]) => void = () => {};
    const load = vi.fn<() => Promise<readonly HomeYourTrade[]>>()
      .mockRejectedValueOnce(new Error('read'))
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue([]);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
    const view = render(<MemoryRouter><HomeDashboardYourTrades load={load} /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Kairos could not load your saved trades. They are still on this device.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('Loading your saved trades…');
    await act(async () => { finish([trade]); });
    expect(await screen.findByRole('button', { name: /^BTCUSDT, long, Profit/ })).toBeInTheDocument();
    view.unmount();

    render(<MemoryRouter><HomeDashboardYourTrades load={load} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { level: 3, name: 'Your trading story starts here' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log your first trade' })).toHaveAttribute('href', '/journal');
  });
});

describe('T-049f Settings on the kit', () => {
  it('names the time zone field with its hint, and "Try again" reads the zone again after a failed read', async () => {
    const db = await database();
    await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'Asia/Manila', '2026-09-27T00:00:00.000Z');
    const read = db.metadata.get.bind(db.metadata);
    let failed = false;
    vi.spyOn(db.metadata, 'get').mockImplementation(((key: string) => {
      if (key === visualPnlTimeZonePreferenceMetadataKey && !failed) { failed = true; return Promise.reject(new Error('storage')); }
      return read(key);
    }) as typeof db.metadata.get);
    render(<ThemeProvider><ToastProvider><SettingsRoute db={db} /></ToastProvider></ThemeProvider>);
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    const input = screen.getByRole('combobox', { name: 'Time zone' });
    expect(input).toHaveAccessibleDescription('Pick your place from the list, for example Australia/Sydney, America/New_York, Europe/London, or UTC.');
    const alert = await screen.findByText('Kairos could not load your daily-results time zone.');
    fireEvent.click(within(alert.closest('[role="alert"]') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Current: Asia/Manila')).toBeInTheDocument();
    expect(input).toHaveValue('Asia/Manila');
    expect(screen.queryByText('Kairos could not load your daily-results time zone.')).toBeNull();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Step 1' })).toBeInTheDocument());
    expect(await axeViolations(document.body)).toEqual([]);
  });
});

describe('T-049f checklist Undo and "Try again"', () => {
  const card = () => screen.getByRole('form', { name: 'Your checklist' });

  it('removing step 2 of 3 offers "Undo", which puts it back in place; nothing is saved', async () => {
    const db = await database();
    const steps = KAIROS_DEFAULT_DISCIPLINE_LISTS.checklist;
    expect(steps.length).toBeGreaterThanOrEqual(3);
    render(<ThemeProvider><ToastProvider><SettingsRoute db={db} /></ToastProvider></ThemeProvider>);
    await waitFor(() => expect(within(card()).getByRole('textbox', { name: 'Step 1' })).toBeInTheDocument());
    const values = () => within(within(card()).getByRole('group', { name: 'Before you trade: your steps' })).getAllByRole('textbox').map(input => (input as HTMLInputElement).value);
    const before = values();
    fireEvent.click(within(card()).getByRole('button', { name: 'Remove step 2' }));
    expect(values()).toEqual([before[0], ...before.slice(2)]);
    const region = screen.getAllByRole('status').find(element => element.classList.contains('kairos-toast-region'))!;
    expect(region).toHaveTextContent('Step 2 removed.');
    const stored = await loadDisciplineLists(db);
    expect(stored.ok && stored.lists.checklist.map(item => item.label)).toEqual(steps.map(item => item.label));
    fireEvent.click(within(region).getByRole('button', { name: 'Undo' }));
    expect(values()).toEqual(before);
    expect(region).not.toHaveTextContent('Step 2 removed.');
  });

  it('a failed load shows "Kairos could not load your checklist." with "Try again", which loads', async () => {
    const db = await database();
    const read = db.metadata.get.bind(db.metadata);
    let failed = false;
    vi.spyOn(db.metadata, 'get').mockImplementation(((key: string) => {
      if (key !== visualPnlTimeZonePreferenceMetadataKey && !failed) { failed = true; return Promise.reject(new Error('storage')); }
      return read(key);
    }) as typeof db.metadata.get);
    render(<ThemeProvider><ToastProvider><SettingsRoute db={db} /></ToastProvider></ThemeProvider>);
    const message = await within(card()).findByText('Kairos could not load your checklist.');
    fireEvent.click(within(message.closest('[role="alert"]') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(await within(card()).findByRole('textbox', { name: 'Step 1' })).toBeInTheDocument();
    expect(within(card()).queryByText('Kairos could not load your checklist.')).toBeNull();
  });
});
