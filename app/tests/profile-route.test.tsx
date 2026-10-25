import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { ProfileRoute } from '../src/app/ProfileRoute';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { ActivationReceiptRepository } from '../src/services/activation';

const names: string[] = [];
async function database() { const name = `kairos-profile-route-${names.length}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const route = () => screen.getByRole('region', { name: 'Profile' });
const mount = (db: Awaited<ReturnType<typeof database>>) => render(<MemoryRouter><ProfileRoute db={db} /></MemoryRouter>);

describe('P28.3 Profile route', () => {
  it('shows the device without an activation receipt, and points backups to their own page (T-054a)', async () => {
    const db = await database();
    mount(db);
    await waitFor(() => expect(route().querySelector('[data-profile-activation]')!.getAttribute('data-profile-activation')).toBe('missing'));
    expect(screen.getByText('No activation receipt is stored on this device.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Backup and restore' })).toHaveAttribute('href', '/backup');
    expect(screen.queryByLabelText('Backup file')).toBeNull();
  });

  it('shows a stored activation receipt read-only and an unreadable one as an alert', async () => {
    const db = await database();
    const receipts = new ActivationReceiptRepository(createKairosRepositories(db).metadata);
    await receipts.saveServerIssuedReceipt({ receiptVersion: 1, activationId: 'act-42', issuedAt: '2026-09-01T10:00:00.000Z', verifierPayload: 'payload', verifierSignature: 'signature' }, new Date('2026-09-02T11:00:00.000Z'));
    const view = mount(db);
    await waitFor(() => expect(route().querySelector('[data-profile-activation]')!.getAttribute('data-profile-activation')).toBe('stored'));
    expect(route().querySelector('[data-profile-activation="stored"]')!.textContent).toBe('Activated · activation act-42 · issued 2026-09-01 10:00:00 UTC · stored on this device 2026-09-02 11:00:00 UTC');
    expect(route().textContent).not.toContain('signature');
    view.unmount();
    await db.metadata.put({ key: 'device.activation.receipt', value: 'not json', updatedAt: '2026-09-02T11:00:00.000Z' });
    mount(db);
    await waitFor(() => expect(route().querySelector('[data-profile-activation]')!.getAttribute('data-profile-activation')).toBe('corrupt'));
    expect(screen.getByRole('alert').textContent).toBe('The stored activation receipt is unreadable.');
  });

});
