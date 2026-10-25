import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { ProfileRoute } from '../src/app/ProfileRoute';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { ActivationReceiptRepository } from '../src/services/activation';
import { saveVisualPnlTimeZone } from '../src/application/visual-pnl';

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
    // T-062f (D283): plain words, never "activation receipt".
    expect(screen.getByText("This device isn't activated.")).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Backup and restore' })).toHaveAttribute('href', '/backup');
    expect(screen.queryByLabelText('Backup file')).toBeNull();
  });

  // T-062f (D283): "This device is activated (since …)." in the saved time zone, never the raw id or the receipt.
  it('says this device is activated and since when, and an unreadable invite as an alert, in plain words', async () => {
    const db = await database();
    await saveVisualPnlTimeZone(db, 'UTC');
    const receipts = new ActivationReceiptRepository(createKairosRepositories(db).metadata);
    await receipts.saveServerIssuedReceipt({ receiptVersion: 1, activationId: 'act-42', issuedAt: '2026-09-01T10:00:00.000Z', verifierPayload: 'payload', verifierSignature: 'signature' }, new Date('2026-09-02T11:00:00.000Z'));
    const view = mount(db);
    await waitFor(() => expect(route().querySelector('[data-profile-activation]')!.getAttribute('data-profile-activation')).toBe('stored'));
    // en-GB writes September "Sep" or "Sept", by the ICU version.
    expect(route().querySelector('[data-profile-activation="stored"]')!.textContent).toMatch(/^This device is activated \(since 1 Sept? 2026\)\.$/);
    expect(route().textContent).not.toContain('act-42');
    expect(route().textContent).not.toMatch(/receipt|activation id/i);
    expect(route().textContent).not.toContain('signature');
    view.unmount();
    await db.metadata.put({ key: 'device.activation.receipt', value: 'not json', updatedAt: '2026-09-02T11:00:00.000Z' });
    mount(db);
    await waitFor(() => expect(route().querySelector('[data-profile-activation]')!.getAttribute('data-profile-activation')).toBe('corrupt'));
    expect(screen.getByRole('alert').textContent).toBe("Kairos can't read this device's invite. It will ask for your code the next time it opens.");
  });

});
