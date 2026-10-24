import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { ProfileRoute, type StorageDurabilityPorts } from '../src/app/ProfileRoute';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import type { StorageDurabilityStatus } from '../src/pwa/storageDurability';

const names: string[] = [];
async function database() { const name = `kairos-profile-safety-${names.length}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });
const route = () => screen.getByRole('region', { name: 'Profile' });
function fakeDurability(initial: StorageDurabilityStatus, granted: boolean) {
  let current = initial;
  const listeners = new Set<(status: StorageDurabilityStatus) => void>();
  const publish = (status: StorageDurabilityStatus) => { current = status; for (const listener of listeners) listener(status); };
  const requests: number[] = [];
  const durability: StorageDurabilityPorts = {
    inspect: async () => { publish(current); return current; },
    request: async () => { requests.push(1); const status: StorageDurabilityStatus = granted ? { state: 'persistent', persistent: true } : { state: 'best-effort', persistent: false }; publish(status); return status; },
    subscribe: listener => { listeners.add(listener); listener(current); return () => { listeners.delete(listener); }; },
  };
  return { durability, requests };
}
const mount = (db: Awaited<ReturnType<typeof database>>, durability: StorageDurabilityPorts) => render(<MemoryRouter><ProfileRoute db={db} durability={durability} /></MemoryRouter>);

describe('P34.2 Profile data safety', () => {
  it('T-054a: a browser that keeps the data gets no request, and backups are on their own page', async () => {
    const db = await database();
    const { durability } = fakeDurability({ state: 'persistent', persistent: true }, true);
    mount(db, durability);
    await waitFor(() => expect(route().querySelector('[data-profile-storage]')!.getAttribute('data-profile-storage')).toBe('persistent'));
    expect(screen.queryByRole('button', { name: 'Keep my data on this device' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Backup and restore' })).toHaveAttribute('href', '/backup');
    expect(screen.queryByRole('button', { name: /back up|download backup/i })).toBeNull();
  });

  it('offers the persistent-storage request on a best-effort browser and reflects the granted state', async () => {
    const db = await database();
    const { durability, requests } = fakeDurability({ state: 'best-effort', persistent: false }, true);
    mount(db, durability);
    await waitFor(() => expect(route().querySelector('[data-profile-storage]')!.getAttribute('data-profile-storage')).toBe('best-effort'));
    expect(route().querySelector('[data-profile-storage]')!.textContent).toBe('This browser may clear Kairos data when storage runs low. Ask it to keep your data, and keep a backup.');
    fireEvent.click(screen.getByRole('button', { name: 'Keep my data on this device' }));
    await waitFor(() => expect(route().querySelector('[data-profile-storage]')!.getAttribute('data-profile-storage')).toBe('persistent'));
    expect(requests).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Keep my data on this device' })).toBeNull();
    expect(route().querySelector('[data-profile-storage]')!.textContent).toBe('This browser has promised to keep Kairos data on this device unless you clear it yourself.');
  });

  it('says so when the browser declines (the stored last backup is read on Backup and restore since T-054a)', async () => {
    const db = await database();
    const { durability } = fakeDurability({ state: 'best-effort', persistent: false }, false);
    mount(db, durability);
    await waitFor(() => expect(route().querySelector('[data-profile-storage]')!.getAttribute('data-profile-storage')).toBe('best-effort'));
    fireEvent.click(screen.getByRole('button', { name: 'Keep my data on this device' }));
    expect((await screen.findByText('The browser did not grant persistent storage this time. Keep a recent backup.')).getAttribute('role')).toBe('status');
    expect(route().querySelector('[data-profile-storage]')!.getAttribute('data-profile-storage')).toBe('best-effort');
    expect(screen.getByRole('button', { name: 'Keep my data on this device' })).toBeTruthy();
  });

  it('explains an unsupported browser without offering the request', async () => {
    const db = await database();
    const { durability } = fakeDurability({ state: 'unsupported', persistent: false }, false);
    mount(db, durability);
    await waitFor(() => expect(route().querySelector('[data-profile-storage]')!.getAttribute('data-profile-storage')).toBe('unsupported'));
    expect(route().querySelector('[data-profile-storage]')!.textContent).toBe('This browser cannot promise to keep data on this device. Keep a recent backup.');
    expect(screen.queryByRole('button', { name: 'Keep my data on this device' })).toBeNull();
  });

  it('T-054d: says how much Kairos keeps here when the browser says, and nothing when it cannot', async () => {
    const db = await database();
    const { durability } = fakeDurability({ state: 'persistent', persistent: true }, true);
    mount(db, { ...durability, estimate: async () => ({ usage: 12_400_000, quota: 2_112_400_000 }) });
    expect(await screen.findByText('Kairos uses about 12 MB · 2.1 GB free')).toBeInTheDocument();
    cleanup();
    mount(db, { ...durability, estimate: async () => null });
    await waitFor(() => expect(route().querySelector('[data-profile-storage]')!.getAttribute('data-profile-storage')).toBe('persistent'));
    expect(route().querySelector('[data-profile-storage-use]')).toBeNull();
  });
});
