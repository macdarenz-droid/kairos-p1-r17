import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { ProfileRoute, type StorageDurabilityPorts } from '../src/app/ProfileRoute';
import { readLastBackup, type BackupDownloadPorts } from '../src/application/backup';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { StorageDurabilityStatus } from '../src/pwa/storageDurability';

const names: string[] = [];
async function database() { const name = `kairos-profile-safety-${names.length}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });
const now = () => '2026-09-18T17:50:00.000Z';
const ports: BackupDownloadPorts = { createObjectUrl: () => 'blob:kairos/x', revokeObjectUrl: () => {}, triggerDownload: () => {} };
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
const mount = (db: Awaited<ReturnType<typeof database>>, durability: StorageDurabilityPorts) => render(<MemoryRouter><ProfileRoute db={db} now={now} downloads={ports} readBackupFile={file => file.text()} durability={durability} /></MemoryRouter>);

describe('P34.2 Profile data safety', () => {
  it('shows never until a backup is downloaded, then records and shows the last backup', async () => {
    const db = await database();
    const { durability } = fakeDurability({ state: 'persistent', persistent: true }, true);
    mount(db, durability);
    await waitFor(() => expect(route().querySelector('[data-profile-last-backup]')!.getAttribute('data-profile-last-backup')).toBe('never'));
    expect(route().querySelector('[data-profile-last-backup]')!.textContent).toBe('Last backup: never on this device. Download one below.');
    expect(route().querySelector('[data-profile-storage]')!.getAttribute('data-profile-storage')).toBe('persistent');
    expect(screen.queryByRole('button', { name: 'Keep my data on this device' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Download backup' }));
    await waitFor(() => expect(route().querySelector('[data-profile-last-backup]')!.getAttribute('data-profile-last-backup')).toBe('recorded'));
    expect(route().querySelector('[data-profile-last-backup]')!.textContent).toBe('Last backup: 2026-09-18 17:50:00 UTC · kairos-backup-2026-09-18T17-50-00Z.json · 0 records.');
    expect(await readLastBackup(createKairosRepositories(db).metadata)).toEqual({ exportedAt: '2026-09-18T17:50:00.000Z', fileName: 'kairos-backup-2026-09-18T17-50-00Z.json', totalRecords: 0 });
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

  it('says so when the browser declines, and reads a stored last backup on load', async () => {
    const db = await database();
    await createKairosRepositories(db).metadata.put({ key: 'device.backup.last-export.v1', value: JSON.stringify({ version: 1, exportedAt: '2026-09-17T08:00:00.000Z', fileName: 'kairos-backup-2026-09-17T08-00-00Z.json', totalRecords: 3 }), updatedAt: '2026-09-17T08:00:00.000Z' });
    const { durability } = fakeDurability({ state: 'best-effort', persistent: false }, false);
    mount(db, durability);
    await waitFor(() => expect(route().querySelector('[data-profile-last-backup]')!.getAttribute('data-profile-last-backup')).toBe('recorded'));
    expect(route().querySelector('[data-profile-last-backup]')!.textContent).toBe('Last backup: 2026-09-17 08:00:00 UTC · kairos-backup-2026-09-17T08-00-00Z.json · 3 records.');
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
});
