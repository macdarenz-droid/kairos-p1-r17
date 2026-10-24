import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { BackupScreen } from '../src/features/backup/BackupScreen';
import { defineSavedAnalysis } from '../src/domain/saved-records/savedAnalysisContract';
import { loadBackupFolder, readBackupReminderSetting, readLastBackup, saveBackupFolder, type BackupDownloadPorts } from '../src/application/backup';
import { saveVisualPnlTimeZone } from '../src/application/visual-pnl';
import { createKairosBackupEnvelope, parseKairosBackup, serializeKairosBackup } from '../src/data/backup';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const names: string[] = [];
async function database() { const name = `kairos-backup-screen-${names.length}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const now = () => '2026-09-18T14:30:00.000Z';
const eth = { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' } as const;
const route = () => screen.getByRole('region', { name: 'Backup and restore' });
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
const mount = (db: Awaited<ReturnType<typeof database>>, downloads: BackupDownloadPorts) => render(<MemoryRouter><BackupScreen db={db} now={now} downloads={downloads} readBackupFile={readBackupFile} /></MemoryRouter>);
const choose = (file: File) => fireEvent.change(screen.getByLabelText('Backup file'), { target: { files: [file] } });
const backupFile = (name: string, contents: string) => new File([contents], name, { type: 'application/json' });
const incomingBackup = () => serializeKairosBackup(createKairosBackupEnvelope({
  metadata: [{ key: 'preferences.goals.v1', value: '{"version":1,"tradesPerMonthTarget":20}', updatedAt: '2026-09-17T07:59:00.000Z' }],
  savedAnalyses: [defineSavedAnalysis({ id: 'a-incoming', market: eth, drawings: [], riskRewards: [], label: 'Restored plan' })],
  exportedAt: new Date('2026-09-17T08:00:00.000Z'),
}));

describe('P28.3 backup and restore, on its own page since T-054a', () => {
  it('downloads a backup through the P28.1 command without changing anything (moved from Profile)', async () => {
    const db = await database();
    await createKairosRepositories(db).savedAnalyses.put(defineSavedAnalysis({ id: 'a-current', market: eth, drawings: [], riskRewards: [], label: 'Current plan' }));
    const { ports, downloaded, urls } = fakeDownloads();
    mount(db, ports);
    await waitFor(() => expect(route().getAttribute('data-backup-export')).toBe('idle'));
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    await waitFor(() => expect(route().getAttribute('data-backup-export')).toBe('done'));
    const contents = await downloaded[0]!.contents;
    expect(screen.getByRole('status').textContent).toBe(`Backup saved: kairos-backup-2026-09-18T14-30-00Z.json · 1 record · ${(new TextEncoder().encode(contents).byteLength / 1024).toFixed(1)} KB. Downloaded.`);
    expect(downloaded).toHaveLength(1);
    expect(downloaded[0]!.fileName).toBe('kairos-backup-2026-09-18T14-30-00Z.json');
    expect(urls).toEqual([]);
    const parsed = parseKairosBackup(contents);
    expect(parsed.exportedAt).toBe('2026-09-18T14:30:00.000Z');
    expect(parsed.payload.savedAnalyses.map(record => record.id)).toEqual(['a-current']);
    expect((await db.savedAnalyses.toArray()).map(record => record.id)).toEqual(['a-current']);
  });


  it('previews a chosen backup, offers the current data first, and replaces the data only on confirmation', async () => {
    const db = await database();
    await createKairosRepositories(db).savedAnalyses.put(defineSavedAnalysis({ id: 'a-current', market: eth, drawings: [], riskRewards: [], label: 'Current plan' }));
    await db.metadata.put({ key: 'device.activation.receipt', value: 'opaque', updatedAt: '2026-09-01T00:00:00.000Z' });
    const { ports, downloaded } = fakeDownloads();
    mount(db, ports);
    choose(backupFile('journal-2026-09-17.json', incomingBackup()));
    await waitFor(() => expect(route().getAttribute('data-backup-restore')).toBe('preview'));
    expect(route().querySelector('.kairos-backup-preview')!.getAttribute('data-backup-preview-records')).toBe('2');
    expect(route().querySelector('.kairos-backup-preview p')!.textContent).toBe('journal-2026-09-17.json was exported 2026-09-17 08:00:00 UTC and holds 2 records: 0 trades, 1 saved analysis, 0 saved snapshots, 1 preference.');
    expect((screen.getByLabelText('Backup file') as HTMLInputElement).disabled).toBe(true);
    expect((await db.savedAnalyses.toArray()).map(record => record.id)).toEqual(['a-current']);
    fireEvent.click(screen.getByRole('button', { name: 'Download current data first' }));
    expect(downloaded).toHaveLength(1);
    expect(downloaded[0]!.fileName).toMatch(/^kairos-backup-.*Z\.json$/);
    expect(parseKairosBackup(await downloaded[0]!.contents).payload.savedAnalyses.map(record => record.id)).toEqual(['a-current']);
    fireEvent.click(screen.getByRole('button', { name: 'Replace my data' }));
    await waitFor(() => expect(route().getAttribute('data-backup-restore')).toBe('restored'));
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
    await waitFor(() => expect(route().getAttribute('data-backup-restore')).toBe('refused'));
    expect(screen.getByRole('alert').textContent).toBe('That file is not a Kairos backup (FORMAT_NAME_MISMATCH). Nothing was changed.');
    choose(backupFile('journal.json', incomingBackup()));
    await waitFor(() => expect(route().getAttribute('data-backup-restore')).toBe('preview'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(route().getAttribute('data-backup-restore')).toBe('idle');
    expect(screen.queryByRole('button', { name: 'Replace my data' })).toBeNull();
    expect((await db.savedAnalyses.toArray()).map(record => record.id)).toEqual(['a-current']);
  });


  it('reports an export that could not read the data and a restore that failed verification with the pre-restore copy', async () => {
    const db = await database();
    await createKairosRepositories(db).savedAnalyses.put(defineSavedAnalysis({ id: 'a-current', market: eth, drawings: [], riskRewards: [], label: 'Current plan' }));
    const { ports, downloaded } = fakeDownloads();
    mount(db, ports);
    choose(backupFile('journal.json', incomingBackup()));
    await waitFor(() => expect(route().getAttribute('data-backup-restore')).toBe('preview'));
    const transaction = vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    await waitFor(() => expect(route().getAttribute('data-backup-export')).toBe('error'));
    expect(screen.getByRole('alert').textContent).toBe('Kairos could not read your data. Nothing was saved.');
    fireEvent.click(screen.getByRole('button', { name: 'Replace my data' }));
    await waitFor(() => expect(route().getAttribute('data-backup-restore')).toBe('failed'));
    expect(screen.getAllByRole('alert').map(node => node.textContent)).toContain('Kairos could not write the backup to this device. Your data from before the restore is available as a download.');
    transaction.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Download the pre-restore copy' }));
    expect(downloaded).toHaveLength(1);
    expect(parseKairosBackup(await downloaded[0]!.contents).payload.savedAnalyses.map(record => record.id)).toEqual(['a-current']);
    expect((await db.savedAnalyses.toArray()).map(record => record.id)).toEqual(['a-current']);
  });
});

describe('T-054a the backup page', () => {
  const lastLine = () => route().querySelector('[data-backup-last]')!;
  const local = (iso: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(iso));

  it('shows "No backup yet", then the last backup with its age in the saved time zone; "Back up now" keeps the focus', async () => {
    const db = await database();
    await saveVisualPnlTimeZone(db, 'Asia/Manila', { now });
    const { ports, downloaded } = fakeDownloads();
    mount(db, ports);
    await waitFor(() => expect(lastLine().getAttribute('data-backup-last')).toBe('never'));
    expect(lastLine().textContent).toBe('No backup yet on this device.');
    const button = screen.getByRole('button', { name: 'Back up now' });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(lastLine().getAttribute('data-backup-last')).toBe('recorded'));
    expect(lastLine().textContent).toBe(`Last backup today · ${local(now())}`);
    expect(button).toHaveFocus();
    expect(downloaded).toHaveLength(1);
    // The whole record, as Profile's test checked it before the move (T-054a fix r1).
    const total = parseKairosBackup(await downloaded[0]!.contents).recordCounts.total;
    expect(await readLastBackup(createKairosRepositories(db).metadata)).toEqual({ exportedAt: now(), fileName: 'kairos-backup-2026-09-18T14-30-00Z.json', totalRecords: total });
  });

  it('reads a stored last backup and says how long ago it was', async () => {
    const db = await database();
    await saveVisualPnlTimeZone(db, 'Asia/Manila', { now });
    await db.metadata.put({ key: 'device.backup.last-export.v1', value: JSON.stringify({ version: 1, exportedAt: '2026-09-06T14:30:00.000Z', fileName: 'kairos-backup-2026-09-06T14-30-00Z.json', totalRecords: 3 }), updatedAt: '2026-09-06T14:30:00.000Z' });
    mount(db, fakeDownloads().ports);
    await waitFor(() => expect(lastLine().getAttribute('data-backup-last')).toBe('recorded'));
    expect(lastLine().textContent).toBe(`Last backup 12 days ago · ${local('2026-09-06T14:30:00.000Z')}`);
  });

  it('"Remind me" saves the choice', async () => {
    const db = await database();
    mount(db, fakeDownloads().ports);
    const every = await screen.findByLabelText('How often');
    expect(every).toHaveValue('7');
    expect([...(every as HTMLSelectElement).options].map(option => option.textContent)).toEqual(['Every week', 'Every 2 weeks', 'Every month', 'Never']);
    fireEvent.change(every, { target: { value: 'never' } });
    expect(await screen.findByText('Saved.')).toHaveAttribute('role', 'status');
    expect(await readBackupReminderSetting(createKairosRepositories(db).metadata)).toBeNull();
  });

  it('a chosen file\'s preview takes the focus, and Cancel gives it to the block\'s heading', async () => {
    const db = await database();
    mount(db, fakeDownloads().ports);
    choose(backupFile('journal.json', incomingBackup()));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download current data first' })).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'Replace everything with a backup' })).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Backup file to import from'), { target: { files: [backupFile('other.json', incomingBackup())] } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add these records' })).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'Add trades from a backup' })).toHaveFocus();
  });

  it('a cancelled share records nothing and says nothing', async () => {
    const db = await database();
    render(<MemoryRouter><BackupScreen db={db} now={now} deliver={async () => 'cancelled'} readBackupFile={readBackupFile} /></MemoryRouter>);
    await waitFor(() => expect(lastLine().getAttribute('data-backup-last')).toBe('never'));
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    await waitFor(() => expect(route().getAttribute('data-backup-export')).toBe('idle'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(await readLastBackup(createKairosRepositories(db).metadata)).toBeNull();
  });
});

describe('T-054b the backup folder and where a backup went', () => {
  const picked = { name: 'Kairos backups' } as never;

  it('has no folder block where the browser cannot keep a folder', async () => {
    const db = await database();
    mount(db, fakeDownloads().ports);
    await screen.findByRole('button', { name: 'Back up now' });
    expect(screen.queryByRole('heading', { name: 'Backup folder' })).toBeNull();
  });

  it('chooses a folder, shows it, changes it and stops using it, keeping the focus on the block', async () => {
    const db = await database();
    let next: unknown = picked;
    render(<MemoryRouter><BackupScreen db={db} now={now} downloads={fakeDownloads().ports} readBackupFile={readBackupFile} pickFolder={async () => next as never} /></MemoryRouter>);
    expect(await screen.findByText('Choose a folder on this computer, and "Back up now" saves each backup there.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a backup folder' }));
    expect(await screen.findByText('Kairos backups')).toBeInTheDocument();
    expect(screen.getByText(/^Backups go to:/)).toHaveTextContent('Backups go to: Kairos backups');
    expect(screen.getByRole('button', { name: 'Change' })).toHaveFocus();
    expect(await loadBackupFolder(db)).toEqual({ name: 'Kairos backups', handle: { name: 'Kairos backups' } });
    // A closed picker changes nothing.
    next = Promise.reject(new DOMException('closed', 'AbortError'));
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    await waitFor(() => expect(screen.getByText(/^Backups go to:/)).toHaveTextContent('Kairos backups'));
    fireEvent.click(screen.getByRole('button', { name: 'Stop using this folder' }));
    expect(await screen.findByRole('button', { name: 'Choose a backup folder' })).toHaveFocus();
    expect(await loadBackupFolder(db)).toBeNull();
  });

  it('says where a backup went: the folder, the share sheet or a download', async () => {
    for (const [delivered, words] of [
      [{ outcome: 'saved', via: 'folder', place: 'Kairos backups' }, 'Saved to Kairos backups.'],
      [{ outcome: 'saved', via: 'share', place: null }, "Shared. Kairos can't see where you shared it; keep it somewhere you can find."],
      [{ outcome: 'saved', via: 'download', place: null }, 'Downloaded.'],
    ] as const) {
      const db = await database();
      render(<MemoryRouter><BackupScreen db={db} now={now} deliver={async () => delivered} readBackupFile={readBackupFile} /></MemoryRouter>);
      fireEvent.click(await screen.findByRole('button', { name: 'Back up now' }));
      expect(await screen.findByText(words)).toBeInTheDocument();
      cleanup();
    }
  });
});

describe('T-054a fix r1', () => {
  const lastLine = () => route().querySelector('[data-backup-last]')!;
  function slowReader() {
    let finish: (text: string) => void = () => undefined;
    const read = () => new Promise<string>(resolve => { finish = resolve; });
    return { read, finish: (text: string) => finish(text) };
  }

  it('the file fields stay usable while a file is read, so a refused file leaves focus on them', async () => {
    const db = await database();
    const reader = slowReader();
    render(<MemoryRouter><BackupScreen db={db} now={now} downloads={fakeDownloads().ports} readBackupFile={reader.read} /></MemoryRouter>);
    choose(backupFile('notes.json', '{}'));
    await waitFor(() => expect(route().getAttribute('data-backup-restore')).toBe('reading'));
    expect(screen.getByLabelText('Backup file')).not.toBeDisabled();
    reader.finish('{"hello":true}');
    await waitFor(() => expect(route().getAttribute('data-backup-restore')).toBe('refused'));
    expect(screen.getByLabelText('Backup file')).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText('Backup file to import from'), { target: { files: [backupFile('notes.json', '{}')] } });
    await waitFor(() => expect(route().getAttribute('data-backup-import')).toBe('reading'));
    expect(screen.getByLabelText('Backup file to import from')).not.toBeDisabled();
    reader.finish('{"hello":true}');
    await waitFor(() => expect(route().getAttribute('data-backup-import')).toBe('refused'));
  });

  it('"Back up now" does nothing while a restore reads its file', async () => {
    const db = await database();
    const reader = slowReader();
    const { ports, downloaded } = fakeDownloads();
    render(<MemoryRouter><BackupScreen db={db} now={now} downloads={ports} readBackupFile={reader.read} /></MemoryRouter>);
    await waitFor(() => expect(lastLine().getAttribute('data-backup-last')).toBe('never'));
    choose(backupFile('journal.json', incomingBackup()));
    await waitFor(() => expect(route().getAttribute('data-backup-restore')).toBe('reading'));
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(route().getAttribute('data-backup-export')).toBe('idle');
    expect(downloaded).toHaveLength(0);
  });

  it('says "yesterday" by the saved time zone\'s calendar, as the date beside it does', async () => {
    const db = await database();
    await saveVisualPnlTimeZone(db, 'Asia/Manila', { now });
    // 23:30 on 17 September in Manila, read at 22:30 on 18 September there (now is 14:30 UTC).
    await db.metadata.put({ key: 'device.backup.last-export.v1', value: JSON.stringify({ version: 1, exportedAt: '2026-09-17T15:30:00.000Z', fileName: 'kairos-backup-2026-09-17T15-30-00Z.json', totalRecords: 3 }), updatedAt: '2026-09-17T15:30:00.000Z' });
    mount(db, fakeDownloads().ports);
    await waitFor(() => expect(lastLine().getAttribute('data-backup-last')).toBe('recorded'));
    expect(lastLine().textContent).toMatch(/^Last backup yesterday · /);
  });

  it('"Remind me" says so when the choice could not be saved', async () => {
    const db = await database();
    mount(db, fakeDownloads().ports);
    const every = await screen.findByLabelText('How often');
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    fireEvent.change(every, { target: { value: '30' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Kairos could not save this. Nothing was changed.');
  });
});


describe('T-054b fix r1', () => {
  const picked = { name: 'Kairos backups' } as never;

  it('says, in the announced line, when the chosen folder could not be written and where the backup went instead', async () => {
    for (const [delivered, words] of [
      [{ outcome: 'saved', via: 'download', place: null, missedFolder: 'Kairos backups' }, 'Kairos could not save to Kairos backups, so it was downloaded instead.'],
      [{ outcome: 'saved', via: 'share', place: null, missedFolder: 'Kairos backups' }, "Kairos could not save to Kairos backups, so it was shared instead. Kairos can't see where you shared it; keep it somewhere you can find."],
      [{ outcome: 'saved', via: 'folder', place: 'Kairos backups' }, 'Saved to Kairos backups.'],
    ] as const) {
      const db = await database();
      render(<MemoryRouter><BackupScreen db={db} now={now} deliver={async () => delivered} readBackupFile={readBackupFile} /></MemoryRouter>);
      fireEvent.click(await screen.findByRole('button', { name: 'Back up now' }));
      expect((await screen.findByText(words)).closest('[role="status"]')).toHaveTextContent(/^Backup saved: /);
      cleanup();
    }
  });

  it('offers nothing while the saved folder is read, and a failed "Stop" keeps showing the folder it kept', async () => {
    const db = await database();
    await saveBackupFolder(db, { name: 'Kairos backups', handle: picked }, { now });
    render(<MemoryRouter><BackupScreen db={db} now={now} downloads={fakeDownloads().ports} readBackupFile={readBackupFile} pickFolder={async () => picked} /></MemoryRouter>);
    expect(screen.getByText('Checking your backup folder…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose a backup folder' })).toBeNull();
    expect(await screen.findByText(/^Backups go to:/)).toHaveTextContent('Backups go to: Kairos backups');
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    const stop = screen.getByRole('button', { name: 'Stop using this folder' });
    stop.focus();
    fireEvent.click(stop);
    expect(await screen.findByRole('alert')).toHaveTextContent('Kairos could not save this. Nothing was changed.');
    expect(screen.getByText(/^Backups go to:/)).toHaveTextContent('Backups go to: Kairos backups');
    // Focus stays on "Stop", so pressing it again tries once more.
    expect(stop).toHaveFocus();
  });
});
