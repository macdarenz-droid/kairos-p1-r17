import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { GoalsRoute } from '../src/app/GoalsRoute';
import { SettingsRoute } from '../src/app/SettingsRoute';
import { ThemeProvider } from '../src/design-system/themes';
import { readVisualPnlTimeZonePreference, type VisualPnlPeriodChoice } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { ResultsDashboard } from '../src/features/results/ResultsDashboard';

/** "Your results" for real trades (T-051e: the Journal's results moved to Analysis). */
function Results({ db }: { readonly db: KairosDatabase }) {
  const [choice, setChoice] = useState<VisualPnlPeriodChoice>({ kind: 'month', at: null });
  return <ResultsDashboard db={db} scope="real" choice={choice} onChoiceChange={setChoice} renderTradeLink={() => null} refreshRevision={0} />;
}

const names: string[] = [];
async function database(): Promise<KairosDatabase> {
  const name = `kairos-device-zone-${crypto.randomUUID()}`;
  names.push(name);
  const db = createKairosDatabase(name);
  await openKairosDatabase(db);
  return db;
}
const saved = (db: KairosDatabase) => readVisualPnlTimeZonePreference(createKairosRepositories(db).metadata);
const deviceButton = () => screen.findByRole('button', { name: 'Use Asia/Manila (this device)' });

beforeEach(() => {
  const real = new Intl.DateTimeFormat().resolvedOptions();
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ ...real, timeZone: 'Asia/Manila' });
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  for (const name of names.splice(0)) await Dexie.delete(name);
});

describe('T-008 time zone in one tap', () => {
  it("Your results: saves this device's zone on first use, then loads", async () => {
    const db = await database();
    render(<MemoryRouter><Results db={db} /></MemoryRouter>);
    expect(await screen.findByText("Kairos set your time zone to Asia/Manila, this device's time zone.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /this device/ })).toBeNull();
    expect(await saved(db)).toBe('Asia/Manila');
  });

  it('Goals: the tap saves the zone and the goals reload', async () => {
    const db = await database();
    const { container } = render(<MemoryRouter><GoalsRoute db={db} now={() => '2026-09-24T12:00:00.000Z'} /></MemoryRouter>);
    const button = await deviceButton();
    expect(container.querySelector('[data-goals-status="time-zone-unconfigured"]')).not.toBeNull();
    expect(await saved(db)).toBeNull();
    fireEvent.click(button);
    await waitFor(() => expect(container.querySelector('[data-goals-status="ready"]')).not.toBeNull());
    expect(await saved(db)).toBe('Asia/Manila');
  });

  it('Settings: offers the button while nothing is saved, and a tap saves and shows it', async () => {
    const db = await database();
    render(<ThemeProvider><SettingsRoute db={db} /></ThemeProvider>);
    const button = await deviceButton();
    expect(await saved(db)).toBeNull();
    fireEvent.click(button);
    expect(await screen.findByText('Current: Asia/Manila')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Time zone/ })).toHaveValue('Asia/Manila');
    expect(await saved(db)).toBe('Asia/Manila');
    expect(screen.queryByRole('button', { name: /this device/ })).toBeNull();
  });

  it('Settings hides the button when the first load failed', async () => {
    const db = await database();
    vi.spyOn(db.metadata, 'get').mockRejectedValue(new Error('storage'));
    render(<ThemeProvider><SettingsRoute db={db} /></ThemeProvider>);
    expect(await screen.findByText('Kairos could not load your time zone.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /this device/ })).toBeNull();
  });

  it('Settings lists known zones for the time zone field', async () => {
    const db = await database();
    render(<ThemeProvider><SettingsRoute db={db} /></ThemeProvider>);
    await deviceButton();
    const input = screen.getByRole('combobox', { name: /Time zone/ });
    const list = document.getElementById(input.getAttribute('list')!)!;
    const values = [...list.querySelectorAll('option')].map(option => option.getAttribute('value'));
    expect(values).toContain('UTC');
    expect(values).toContain('Asia/Manila');
  });

  it('shows no button when the device does not report a time zone', async () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ ...new Intl.DateTimeFormat().resolvedOptions(), timeZone: '' });
    const db = await database();
    render(<MemoryRouter><Results db={db} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Choose your time zone' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /this device/ })).toBeNull();
  });
});
