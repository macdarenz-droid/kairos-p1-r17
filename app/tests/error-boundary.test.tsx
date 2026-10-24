import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary, type CrashScreenPorts } from '../src/app/ErrorBoundary';
import { runBackup, type BackupDownloadPorts } from '../src/application/backup';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { diagnostics } from '../src/diagnostics/DiagnosticsService';
import { createBackupDelivery } from '../src/features/backup/backupDelivery';
import { axeViolations } from './fixtures/axe';

function BrokenChild(): never {
  throw new Error('test render failure');
}

describe('AppErrorBoundary', () => {
  it('replaces a failed render with the recovery shell and records diagnostics', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const before = diagnostics.snapshot().length;

    render(<AppErrorBoundary><BrokenChild /></AppErrorBoundary>);

    expect(screen.getByRole('alert')).toHaveTextContent('Kairos hit a problem');
    const events = diagnostics.snapshot().slice(before);
    expect(events.some((event) => event.event === 'render_error' && event.category === 'app')).toBe(true);
    consoleError.mockRestore();
  });
});

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
/** A crash with the screen's browser parts faked: a journal to copy, downloads and the clipboard. */
async function crash(clipboard: CrashScreenPorts['clipboard'], downloadFails = false) {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const name = `kairos-crash-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  await saveManualTrade(db, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'cancelled', openedAt: '2026-10-23T08:00:00.000Z' }, { now: () => '2026-10-23T08:00:00.000Z' });
  const downloaded: Array<{ name: string; contents: Promise<string> }> = [];
  const downloads: BackupDownloadPorts = {
    createObjectUrl: blob => { downloaded.push({ name: '', contents: blob.text() }); return 'blob:kairos/1'; },
    revokeObjectUrl: () => undefined,
    triggerDownload: (_url, fileName) => { if (downloadFails) throw new Error('blocked'); downloaded[downloaded.length - 1]!.name = fileName; },
  };
  const reload = vi.fn();
  const ports: CrashScreenPorts = { downloadCopy: () => runBackup(db, createBackupDelivery({ downloads }), { now: () => '2026-10-24T01:00:00.000Z' }), clipboard, reload };
  const view = render(<AppErrorBoundary ports={ports}><BrokenChild /></AppErrorBoundary>);
  return { ...view, downloaded, reload };
}

describe('T-054e the crash screen', () => {
  it('says the journal is safe, focuses its heading, and offers Reload, a copy and the details', async () => {
    const { container, reload } = await crash(null);
    expect(screen.getByRole('heading', { level: 1, name: 'Kairos hit a problem' })).toHaveFocus();
    expect(screen.getByText('Your journal is safe on this device. Reload to try again.')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Reload', 'Download a copy of my data', 'Copy error details']);
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('"Download a copy of my data" downloads a backup and names the file, or says it could not', async () => {
    const { downloaded } = await crash(null);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Download a copy of my data' })); });
    expect(await screen.findByText('Downloaded kairos-backup-2026-10-24T01-00-00Z.json.')).toBeInTheDocument();
    expect(downloaded.map(file => file.name)).toEqual(['kairos-backup-2026-10-24T01-00-00Z.json']);
    expect(JSON.parse(await downloaded[0]!.contents)).toMatchObject({ formatName: 'kairos-full-backup' });
    cleanup();
    await crash(null, true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Download a copy of my data' })); });
    expect(await screen.findByText('Kairos could not make a copy. Nothing was changed.')).toBeInTheDocument();
  });

  it('"Copy error details" copies the details and says so', async () => {
    const copied: string[] = [];
    await crash({ writeText: async text => { copied.push(text); } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy error details' })); });
    expect(await screen.findByText('Copied. This is the text:')).toBeInTheDocument();
    expect(copied).toHaveLength(1);
    // The trader sees exactly what was copied.
    expect((screen.getByRole('textbox', { name: 'Error details' }) as HTMLTextAreaElement).value).toBe(copied[0]);
    expect(copied[0]).toContain('Error: Error: test render failure');
    expect(copied[0]).toContain('at BrokenChild');
    expect(copied[0]).not.toContain('ETHUSDT');
  });

  it('says when the copy was saved but could not be noted, and keeps live messages out of the alert', async () => {
    await crash(null);
    cleanup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<AppErrorBoundary ports={{ downloadCopy: async () => ({ ok: false, reason: 'record-failed' }), clipboard: null, reload: vi.fn() }}><BrokenChild /></AppErrorBoundary>);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Download a copy of my data' })); });
    const said = await screen.findByText('The backup file was saved, but Kairos could not note when. Nothing else was changed.');
    expect(screen.getByRole('alert')).not.toContainElement(said);
    expect(screen.getByRole('alert')).toHaveTextContent('Kairos hit a problem');
  });

  it('without a clipboard, or when the browser refuses, shows the details in a box with "Select all"', async () => {
    for (const clipboard of [null, { writeText: async () => { throw new DOMException('denied', 'NotAllowedError'); } }]) {
      await crash(clipboard);
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy error details' })); });
      const box = await screen.findByRole('textbox', { name: 'Error details' });
      expect(box).toHaveAttribute('readonly');
      expect((box as HTMLTextAreaElement).value).toContain('Error: Error: test render failure');
      fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
      expect(box).toHaveFocus();
      expect([(box as HTMLTextAreaElement).selectionStart, (box as HTMLTextAreaElement).selectionEnd]).toEqual([0, (box as HTMLTextAreaElement).value.length]);
      cleanup();
    }
  });
});
