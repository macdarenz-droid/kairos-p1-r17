import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JournalRoute } from '../src/app/JournalRoute';
import { PracticeRoute } from '../src/app/PracticeRoute';
import { askToKeepDataOnce, persistAskedMetadataKey } from '../src/application/setup/deviceKeeping';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { ToastProvider } from '../src/design-system/primitives';

const names: string[] = [];
const opened: Dexie[] = [];
const originalStorage = Object.getOwnPropertyDescriptor(navigator, 'storage');
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  if (originalStorage) Object.defineProperty(navigator, 'storage', originalStorage); else Reflect.deleteProperty(navigator, 'storage');
  for (const db of opened.splice(0)) db.close();
  for (const name of names.splice(0)) await Dexie.delete(name);
});
async function database(): Promise<KairosDatabase> {
  const name = `kairos-keep-data-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  return db;
}
const now = () => '2026-10-23T10:00:00.000Z';
/** The browser's storage: kept already or not, and what "Keep my data" answers. */
function storage(persisted: boolean, grants: boolean) {
  const persist = vi.fn(async () => grants);
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { persisted: vi.fn(async () => persisted), persist } });
  return persist;
}
const KEPT = 'Kairos will keep your journal on this device.';

/** Saves a cancelled trade through the Journal's form and waits until it is stored. */
async function saveInJournal(db: KairosDatabase, symbol: string): Promise<void> {
  const before = await db.trades.count();
  const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label, { selector: 'input, select' }), { target: { value } });
  type(/^Symbol/, symbol);
  type(/^Market/, 'crypto');
  type(/^Direction/, 'long');
  type(/^Status/, 'cancelled');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save trade' })); });
  await waitFor(async () => expect(await db.trades.count()).toBe(before + 1));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
}

describe('T-054c "Keep my data" asked after the first journal save', () => {
  it('asks once, after the first trade saved in the Journal, and says so when it is kept', async () => {
    const db = await database();
    const persist = storage(false, true);
    render(<ToastProvider><MemoryRouter><JournalRoute db={db} now={now} /></MemoryRouter></ToastProvider>);
    await screen.findByRole('button', { name: 'Save trade' });
    expect(persist).not.toHaveBeenCalled();
    await saveInJournal(db, 'FIRSTONE');
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(KEPT)).toBeInTheDocument();
    expect(await db.metadata.get(persistAskedMetadataKey)).toMatchObject({ value: JSON.stringify({ version: 1, askedAt: now() }) });
    await saveInJournal(db, 'SECONDONE');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('is not asked after a practice trade', async () => {
    const db = await database();
    const persist = storage(false, true);
    render(<ToastProvider><MemoryRouter><PracticeRoute db={db} now={now} /></MemoryRouter></ToastProvider>);
    const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label, { selector: 'input, select' }), { target: { value } });
    await screen.findByRole('button', { name: 'Save practice trade' });
    type(/^Symbol/, 'PRACTICEONE');
    type(/^Market/, 'crypto');
    type(/^Direction/, 'long');
    type(/^Status/, 'cancelled');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save practice trade' })); });
    await waitFor(async () => expect(await db.trades.count()).toBe(1));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(persist).not.toHaveBeenCalled();
    expect(await db.metadata.get(persistAskedMetadataKey)).toBeUndefined();
  });

  it('says nothing when the browser refuses, and never asks again', async () => {
    const db = await database();
    const persist = storage(false, false);
    render(<ToastProvider><MemoryRouter><JournalRoute db={db} now={now} /></MemoryRouter></ToastProvider>);
    await screen.findByRole('button', { name: 'Save trade' });
    await saveInJournal(db, 'REFUSEDONE');
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(screen.queryByText(KEPT)).toBeNull();
    await saveInJournal(db, 'REFUSEDTWO');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('asks nothing when the data is kept already or the browser cannot keep it, or the flag cannot be saved', async () => {
    const db = await database();
    const kept = storage(true, true);
    expect(await askToKeepDataOnce(db, undefined, { now })).toBe('not-asked');
    expect(kept).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined });
    expect(await askToKeepDataOnce(db, undefined, { now })).toBe('not-asked');
    const persist = storage(false, true);
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    expect(await askToKeepDataOnce(db, undefined, { now })).toBe('not-asked');
    expect(persist).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    storage(false, true);
    expect(await askToKeepDataOnce(db, undefined, { now })).toBe('kept');
  });
});
