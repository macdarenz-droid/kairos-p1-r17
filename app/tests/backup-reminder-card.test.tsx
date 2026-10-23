import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HomeRoute } from '../src/app/HomeRoute';
import { exportKairosBackup, loadBackupReminder, readLastBackup, recordLastBackup, type BackupDeliver } from '../src/application/backup';
import { skipSetup } from '../src/application/setup/setupState';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { BackupReminderCard } from '../src/features/backup/BackupReminderCard';

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => null,
}));

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-backup-card-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  await skipSetup(db, { now });
  return db;
}
beforeAll(async () => { await import('../src/app/JournalRoute'); }, 30_000);
const now = () => '2026-10-23T10:00:00.000Z';
const trade = { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt: '2026-10-01T08:00:00.000Z' } as const;
const card = () => screen.findByRole('region', { name: 'Back up your journal' });
/** A card between two buttons, so "the next control" is known. */
function harness(db: KairosDatabase, deliver: BackupDeliver) {
  render(<><button type="button">Before</button><BackupReminderCard db={db} now={now} deliver={deliver} /><button type="button">After</button></>);
}

describe('T-054a the backup reminder card', () => {
  it('says why a backup is due: never, how long ago, or how many trades since', async () => {
    const db = await database();
    await saveManualTrade(db, trade, { now: () => '2026-10-01T08:00:00.000Z' });
    harness(db, async () => 'saved');
    expect(within(await card()).getByText('No backup yet. Save a copy of your journal so you never lose it.')).toBeInTheDocument();
    cleanup();
    const exported = await exportKairosBackup(db, new Date('2026-10-11T09:00:00.000Z'));
    if (!exported.ok) throw new Error('export failed');
    await recordLastBackup(createKairosRepositories(db).metadata, exported.file);
    harness(db, async () => 'saved');
    expect(within(await card()).getByText('Last backup 12 days ago.')).toBeInTheDocument();
    cleanup();
    const fresh = await exportKairosBackup(db, new Date('2026-10-22T09:00:00.000Z'));
    if (!fresh.ok) throw new Error('export failed');
    await recordLastBackup(createKairosRepositories(db).metadata, fresh.file);
    for (let i = 0; i < 23; i += 1) await saveManualTrade(db, trade, { now: () => '2026-10-22T12:00:00.000Z' });
    harness(db, async () => 'saved');
    expect(within(await card()).getByText('23 trades since your last backup.')).toBeInTheDocument();
  });

  it('"Back up now" saves here, says so, records the backup and moves focus to the next control', async () => {
    const db = await database();
    await saveManualTrade(db, trade, { now });
    const files: string[] = [];
    harness(db, async file => { files.push(file.fileName); return 'saved'; });
    const button = within(await card()).getByRole('button', { name: 'Back up now' });
    button.focus();
    await act(async () => { fireEvent.click(button); });
    expect(await screen.findByText('Backup saved.')).toHaveAttribute('role', 'status');
    await waitFor(() => expect(screen.getByRole('button', { name: 'After' })).toHaveFocus());
    expect(files).toEqual(['kairos-backup-2026-10-23T10-00-00Z.json']);
    expect(await readLastBackup(createKairosRepositories(db).metadata)).toMatchObject({ exportedAt: now() });
    expect((await loadBackupReminder(db, { now })).due).toBe(false);
  });

  it('"Later" hides it for a day and moves focus to the next control', async () => {
    const db = await database();
    await saveManualTrade(db, trade, { now });
    harness(db, async () => 'saved');
    const later = within(await card()).getByRole('button', { name: 'Later' });
    later.focus();
    await act(async () => { fireEvent.click(later); });
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Back up your journal' })).toBeNull());
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    expect((await loadBackupReminder(db, { now })).due).toBe(false);
  });

  it('a failed backup says so with "Try again", which keeps the focus', async () => {
    const db = await database();
    await saveManualTrade(db, trade, { now });
    let outcome: 'failed' | 'saved' = 'failed';
    harness(db, async () => outcome);
    const button = within(await card()).getByRole('button', { name: 'Back up now' });
    button.focus();
    await act(async () => { fireEvent.click(button); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Your browser did not take the backup file. Nothing was changed.');
    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(retry).toHaveFocus();
    expect(await readLastBackup(createKairosRepositories(db).metadata)).toBeNull();
    outcome = 'saved';
    await act(async () => { fireEvent.click(retry); });
    expect(await screen.findByText('Backup saved.')).toBeInTheDocument();
  });

  it('a cancelled share leaves the card as it was, with no message', async () => {
    const db = await database();
    await saveManualTrade(db, trade, { now });
    harness(db, async () => 'cancelled');
    const button = within(await card()).getByRole('button', { name: 'Back up now' });
    await act(async () => { fireEvent.click(button); });
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Back up now' })).toBeInTheDocument();
  });

  it('shows on Home above Getting started and on the Journal above the trade form, only while due', async () => {
    const db = await database();
    render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <HomeRoute db={db} now={now} /> }], { initialEntries: ['/'] })} />);
    await screen.findByRole('region', { name: 'Getting started' });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(screen.queryByRole('region', { name: 'Back up your journal' })).toBeNull();
    cleanup();
    await saveManualTrade(db, trade, { now });
    render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <HomeRoute db={db} now={now} /> }], { initialEntries: ['/'] })} />);
    const onHome = await card();
    expect(onHome.compareDocumentPosition(await screen.findByRole('region', { name: 'Getting started' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();
    const { JournalRoute } = await import('../src/app/JournalRoute');
    render(<MemoryRouter><JournalRoute db={db} now={now} /></MemoryRouter>);
    const onJournal = await card();
    expect(onJournal.compareDocumentPosition(screen.getByRole('textbox', { name: /^Symbol/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
