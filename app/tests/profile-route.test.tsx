import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { ProfileRoute } from '../src/app/ProfileRoute';
import { defineSavedAnalysis } from '../src/app/savedAnalysisContract';
import type { BackupDownloadPorts } from '../src/application/backup';
import { createKairosBackupEnvelope, parseKairosBackup, serializeKairosBackup } from '../src/data/backup';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { ActivationReceiptRepository } from '../src/services/activation';

const names: string[] = [];
async function database() { const name = `kairos-profile-route-${names.length}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const now = () => '2026-09-18T14:30:00.000Z';
const eth = { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' } as const;
const route = () => screen.getByRole('region', { name: 'Profile' });
function fakeDownloads() {
  const downloaded: Array<{ fileName: string; contents: Promise<string>; type: string }> = [];
  const urls: string[] = [];
  const ports: BackupDownloadPorts = {
    createObjectUrl: blob => { const url = `blob:kairos/${urls.length + 1}`; urls.push(url); downloaded.push({ fileName: '', contents: blob.text(), type: blob.type }); return url; },
    revokeObjectUrl: url => { urls.splice(urls.indexOf(url), 1); },
    triggerDownload: (_url, fileName) => { downloaded[downloaded.length - 1]!.fileName = fileName; },
  };
  return { ports, downloaded, urls };
}
const readBackupFile = (file: File) => file.text();
const mount = (db: Awaited<ReturnType<typeof database>>, downloads: BackupDownloadPorts) => render(<MemoryRouter><ProfileRoute db={db} now={now} downloads={downloads} readBackupFile={readBackupFile} /></MemoryRouter>);
const choose = (file: File) => fireEvent.change(screen.getByLabelText('Backup file'), { target: { files: [file] } });
const backupFile = (name: string, contents: string) => new File([contents], name, { type: 'application/json' });
const incomingBackup = () => serializeKairosBackup(createKairosBackupEnvelope({
  metadata: [{ key: 'preferences.goals.v1', value: '{"version":1,"tradesPerMonthTarget":20}', updatedAt: '2026-09-17T07:59:00.000Z' }],
  savedAnalyses: [defineSavedAnalysis({ id: 'a-incoming', market: eth, drawings: [], riskRewards: [], label: 'Restored plan' })],
  exportedAt: new Date('2026-09-17T08:00:00.000Z'),
}));

describe('P28.3 Profile route', () => {
  it('shows the device without an activation receipt and downloads a backup through the P28.1 command without changing anything', async () => {
    const db = await database();
    await createKairosRepositories(db).savedAnalyses.put(defineSavedAnalysis({ id: 'a-current', market: eth, drawings: [], riskRewards: [], label: 'Current plan' }));
    const { ports, downloaded, urls } = fakeDownloads();
    mount(db, ports);
    await waitFor(() => expect(route().getAttribute('data-profile-export')).toBe('idle'));
    await waitFor(() => expect(route().querySelector('[data-profile-activation]')!.getAttribute('data-profile-activation')).toBe('missing'));
    expect(screen.getByText('No activation receipt is stored on this device.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download backup' }));
    await waitFor(() => expect(route().getAttribute('data-profile-export')).toBe('done'));
    const contents = await downloaded[0]!.contents;
    expect(screen.getByRole('status').textContent).toBe(`Backup downloaded: kairos-backup-2026-09-18T14-30-00Z.json · 1 record · ${(new TextEncoder().encode(contents).byteLength / 1024).toFixed(1)} KB.`);
    expect(downloaded).toHaveLength(1);
    expect(downloaded[0]!.fileName).toBe('kairos-backup-2026-09-18T14-30-00Z.json');
    expect(urls).toEqual([]);
    const parsed = parseKairosBackup(contents);
    expect(parsed.exportedAt).toBe('2026-09-18T14:30:00.000Z');
    expect(parsed.payload.savedAnalyses.map(record => record.id)).toEqual(['a-current']);
    expect((await db.savedAnalyses.toArray()).map(record => record.id)).toEqual(['a-current']);
  });

  it('shows a stored activation receipt read-only and an unreadable one as an alert', async () => {
    const db = await database();
    const receipts = new ActivationReceiptRepository(createKairosRepositories(db).metadata);
    await receipts.saveServerIssuedReceipt({ receiptVersion: 1, activationId: 'act-42', issuedAt: '2026-09-01T10:00:00.000Z', verifierPayload: 'payload', verifierSignature: 'signature' }, new Date('2026-09-02T11:00:00.000Z'));
    const { ports } = fakeDownloads();
    const view = mount(db, ports);
    await waitFor(() => expect(route().querySelector('[data-profile-activation]')!.getAttribute('data-profile-activation')).toBe('stored'));
    expect(route().querySelector('[data-profile-activation="stored"]')!.textContent).toBe('Activated · activation act-42 · issued 2026-09-01 10:00:00 UTC · stored on this device 2026-09-02 11:00:00 UTC');
    expect(route().textContent).not.toContain('signature');
    view.unmount();
    await db.metadata.put({ key: 'device.activation.receipt', value: 'not json', updatedAt: '2026-09-02T11:00:00.000Z' });
    mount(db, ports);
    await waitFor(() => expect(route().querySelector('[data-profile-activation]')!.getAttribute('data-profile-activation')).toBe('corrupt'));
    expect(screen.getByRole('alert').textContent).toBe('The stored activation receipt is unreadable.');
  });

  it('previews a chosen backup, offers the current data first, and replaces the data only on confirmation', async () => {
    const db = await database();
    await createKairosRepositories(db).savedAnalyses.put(defineSavedAnalysis({ id: 'a-current', market: eth, drawings: [], riskRewards: [], label: 'Current plan' }));
    await db.metadata.put({ key: 'device.activation.receipt', value: 'opaque', updatedAt: '2026-09-01T00:00:00.000Z' });
    const { ports, downloaded } = fakeDownloads();
    mount(db, ports);
    choose(backupFile('journal-2026-09-17.json', incomingBackup()));
    await waitFor(() => expect(route().getAttribute('data-profile-restore')).toBe('preview'));
    expect(route().querySelector('.kairos-profile-preview')!.getAttribute('data-profile-preview-records')).toBe('2');
    expect(route().querySelector('.kairos-profile-preview p')!.textContent).toBe('journal-2026-09-17.json was exported 2026-09-17 08:00:00 UTC and holds 2 records: 0 trades, 1 saved analysis, 0 saved snapshots, 1 preference.');
    expect((screen.getByLabelText('Backup file') as HTMLInputElement).disabled).toBe(true);
    expect((await db.savedAnalyses.toArray()).map(record => record.id)).toEqual(['a-current']);
    fireEvent.click(screen.getByRole('button', { name: 'Download current data first' }));
    expect(downloaded).toHaveLength(1);
    expect(downloaded[0]!.fileName).toMatch(/^kairos-backup-.*Z\.json$/);
    expect(parseKairosBackup(await downloaded[0]!.contents).payload.savedAnalyses.map(record => record.id)).toEqual(['a-current']);
    fireEvent.click(screen.getByRole('button', { name: 'Replace my data' }));
    await waitFor(() => expect(route().getAttribute('data-profile-restore')).toBe('restored'));
    expect(screen.getByRole('status').textContent).toBe('Restored 2 records from journal-2026-09-17.json and verified them after reopening. Other pages show the restored data when you open them.');
    expect((await db.savedAnalyses.toArray()).map(record => record.id)).toEqual(['a-incoming']);
    expect((await db.metadata.toArray()).map(record => record.key).sort()).toEqual(['device.activation.receipt', 'preferences.goals.v1']);
    expect((screen.getByLabelText('Backup file') as HTMLInputElement).disabled).toBe(false);
  });

  it('refuses a file that is not a backup, lets the user cancel a preview, and writes nothing either way', async () => {
    const db = await database();
    await createKairosRepositories(db).savedAnalyses.put(defineSavedAnalysis({ id: 'a-current', market: eth, drawings: [], riskRewards: [], label: 'Current plan' }));
    const { ports } = fakeDownloads();
    mount(db, ports);
    choose(backupFile('notes.json', '{"hello":true}'));
    await waitFor(() => expect(route().getAttribute('data-profile-restore')).toBe('refused'));
    expect(screen.getByRole('alert').textContent).toBe('That file is not a Kairos backup (FORMAT_NAME_MISMATCH). Nothing was changed.');
    choose(backupFile('journal.json', incomingBackup()));
    await waitFor(() => expect(route().getAttribute('data-profile-restore')).toBe('preview'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(route().getAttribute('data-profile-restore')).toBe('idle');
    expect(screen.queryByRole('button', { name: 'Replace my data' })).toBeNull();
    expect((await db.savedAnalyses.toArray()).map(record => record.id)).toEqual(['a-current']);
  });

  it('reports an export that could not read the data and a restore that failed verification with the pre-restore copy', async () => {
    const db = await database();
    await createKairosRepositories(db).savedAnalyses.put(defineSavedAnalysis({ id: 'a-current', market: eth, drawings: [], riskRewards: [], label: 'Current plan' }));
    const { ports, downloaded } = fakeDownloads();
    mount(db, ports);
    choose(backupFile('journal.json', incomingBackup()));
    await waitFor(() => expect(route().getAttribute('data-profile-restore')).toBe('preview'));
    const transaction = vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    fireEvent.click(screen.getByRole('button', { name: 'Download backup' }));
    await waitFor(() => expect(route().getAttribute('data-profile-export')).toBe('error'));
    expect(screen.getByRole('alert').textContent).toBe('Kairos could not read your data. Nothing was downloaded.');
    fireEvent.click(screen.getByRole('button', { name: 'Replace my data' }));
    await waitFor(() => expect(route().getAttribute('data-profile-restore')).toBe('failed'));
    expect(screen.getAllByRole('alert').map(node => node.textContent)).toContain('Kairos could not write the backup to this device. Your data from before the restore is available as a download.');
    transaction.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Download the pre-restore copy' }));
    expect(downloaded).toHaveLength(1);
    expect(parseKairosBackup(await downloaded[0]!.contents).payload.savedAnalyses.map(record => record.id)).toEqual(['a-current']);
    expect((await db.savedAnalyses.toArray()).map(record => record.id)).toEqual(['a-current']);
  });
});
