import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBackupReminder, runBackup, type BackupDownloadPorts } from '../src/application/backup';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { ActivationBootstrap, ActivationGate, type ActivationGateController, type ActivationJournalPort } from '../src/features/activation';
import { createBackupDelivery } from '../src/features/backup/backupDelivery';
import {
  initialActivationSnapshot,
  reduceActivationState,
  type ActivationSnapshot,
  type ActivationValidationResult,
} from '../src/services/activation';
import { axeViolations } from './fixtures/axe';

function snapshot(status: ActivationSnapshot['status'], message: string | null = null): ActivationSnapshot {
  return { status, receipt: null, message };
}

/** The snapshot the coordinator gives for a server or network answer (its own reducer). */
function refused(result: Extract<ActivationValidationResult, { ok: false }>): ActivationSnapshot {
  return reduceActivationState(initialActivationSnapshot, { type: 'VALIDATION_FINISHED', result });
}

function controller(overrides: Partial<ActivationGateController> = {}): ActivationGateController {
  return {
    bootstrap: vi.fn(async () => snapshot('activation-required')),
    activate: vi.fn(async () => snapshot('active-online')),
    ...overrides,
  };
}

const LOST_ACCESS = "Lost access? Here's what to do";

async function submitCode(code = 'NOPE'): Promise<void> {
  fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: code } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Activate Kairos' })); });
}

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  for (const db of opened.splice(0)) db.close();
  for (const name of names.splice(0)) await Dexie.delete(name);
});

async function database(): Promise<KairosDatabase> {
  const name = `kairos-gate-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  return db;
}

/** The journal port as main.tsx builds it, on a test database, with downloads faked. */
function journalOf(db: KairosDatabase, downloadFails = false): ActivationJournalPort & { readonly downloaded: string[] } {
  const downloaded: string[] = [];
  const downloads: BackupDownloadPorts = {
    createObjectUrl: () => 'blob:kairos/1',
    revokeObjectUrl: () => undefined,
    triggerDownload: (_url, fileName) => { if (downloadFails) throw new Error('blocked'); downloaded.push(fileName); },
  };
  return {
    downloaded,
    load: async () => {
      const reminder = await loadBackupReminder(db, { now: () => '2026-10-24T01:00:00.000Z' });
      return { lastBackupAt: reminder.lastBackupAt, tradesSince: reminder.tradesSince, timeZone: 'UTC' };
    },
    downloadCopy: () => runBackup(db, createBackupDelivery({ downloads }), { now: () => '2026-10-24T01:00:00.000Z' }),
  };
}

async function oneTrade(db: KairosDatabase): Promise<void> {
  await saveManualTrade(db, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'cancelled', openedAt: '2026-10-23T08:00:00.000Z' }, { now: () => '2026-10-23T08:00:00.000Z' });
}

describe('P7.6 activation presentation gate', () => {
  it('does not render journal routes before activation bootstrap completes', async () => {
    let resolveBootstrap!: (value: ActivationSnapshot) => void;
    const pending = new Promise<ActivationSnapshot>((resolve) => { resolveBootstrap = resolve; });
    const gate = controller({ bootstrap: vi.fn(() => pending) });

    render(<ActivationGate controller={gate} appVersion="0.1" buildId="test"><h2>Journal core</h2></ActivationGate>);

    expect(screen.queryByRole('heading', { name: 'Journal core' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Checking this device…');

    resolveBootstrap(snapshot('active-offline'));
    expect(await screen.findByRole('heading', { name: 'Journal core' })).toBeInTheDocument();
  });

  it('submits a normalized invite to the coordinator and renders the app only after success', async () => {
    const activate = vi.fn(async () => snapshot('active-online'));
    const gate = controller({ activate });

    render(<ActivationGate controller={gate} appVersion="0.1" buildId="build-7"><h2>Journal core</h2></ActivationGate>);
    await screen.findByRole('heading', { name: 'Welcome to Kairos' });

    fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: '  INVITE-123  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Activate Kairos' }));

    await waitFor(() => expect(activate).toHaveBeenCalledWith({
      inviteCode: 'INVITE-123',
      appVersion: '0.1',
      buildId: 'build-7',
    }));
    expect(await screen.findByRole('heading', { name: 'Journal core' })).toBeInTheDocument();
  });

  // T-062e (D281): words for each reason, instead of one sentence for all. A refusal or a server problem is announced as
  // an alert; no internet is a calm status (nothing is wrong with the code).
  it.each([
    [{ ok: false, reason: 'invalid-code' }, "Kairos doesn't know this code. Check it and try again.", 'alert'],
    [{ ok: false, reason: 'expired-code' }, 'This code has expired. Ask the person who gave it to you for a new one.', 'alert'],
    [{ ok: false, reason: 'already-used', deviceLimit: 3 }, 'This code is already used on 3 devices.', 'alert'],
    [{ ok: false, reason: 'rate-limited' }, 'Too many tries. Wait a minute, then try again.', 'alert'],
    [{ ok: false, reason: 'network-unavailable' }, 'Kairos needs the internet to check your code the first time.', 'status'],
    [{ ok: false, reason: 'service-error' }, "Kairos couldn't check your code right now. Try again in a few minutes.", 'alert'],
  ] as const)('keeps the gate closed and says what went wrong in plain words: %o', async (result, words, role) => {
    const gate = controller({ activate: vi.fn(async () => refused(result)) });

    render(<ActivationGate controller={gate} appVersion="0.1" buildId="test"><h2>Journal core</h2></ActivationGate>);
    await screen.findByRole('heading', { name: 'Welcome to Kairos' });
    await submitCode();

    expect(await screen.findByText(words)).toHaveClass('kairos-activation__feedback');
    expect(screen.getByRole(role)).toHaveTextContent(words);
    expect(screen.getByLabelText('Invite code')).toHaveAccessibleDescription(expect.stringContaining(words));
    expect(screen.queryByText('This invite could not be activated.')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Journal core' })).not.toBeInTheDocument();
  });

  it('identifies an empty invite as an input error without contacting the coordinator', async () => {
    const activate = vi.fn(async () => snapshot('active-online'));
    const gate = controller({ activate });

    render(<ActivationGate controller={gate} appVersion="0.1" buildId="test"><h2>Journal core</h2></ActivationGate>);
    await screen.findByRole('heading', { name: 'Welcome to Kairos' });
    fireEvent.click(screen.getByRole('button', { name: 'Activate Kairos' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your invite code to continue.');
    expect(screen.getByLabelText('Invite code')).toHaveAttribute('aria-invalid', 'true');
    expect(activate).not.toHaveBeenCalled();
  });
});

describe('T-062e the invite screen: logo, plain words, "Lost access?" and a copy of the journal', () => {
  it('shows the Kairos logo, a welcome and where codes come from', async () => {
    const { container } = render(<ActivationGate controller={controller()} appVersion="0.1" buildId="test"><h2>Journal core</h2></ActivationGate>);
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome to Kairos' })).toBeInTheDocument();
    const logo = container.querySelector('img');
    expect(logo).toHaveAttribute('src', '/icons/kairos-icon-192.png');
    expect(logo).toHaveAttribute('alt', '');
    expect(screen.getByText('Type your invite code once. After that, Kairos opens on this device even without internet.')).toBeInTheDocument();
    expect(screen.getByLabelText('Invite code')).toHaveAccessibleDescription('Kairos is invite-only for now. Your code comes from the person who invited you.');
  });

  it('shows the logo while Kairos prepares, and when it can\'t open', async () => {
    const journal: ActivationJournalPort = { load: vi.fn(), downloadCopy: vi.fn() };
    const preparing = render(<ActivationBootstrap databaseStartup={new Promise(() => undefined)} journal={journal}><h2>Journal core</h2></ActivationBootstrap>);
    expect(screen.getByRole('status')).toHaveTextContent('Preparing Kairos…');
    expect(preparing.container.querySelector('img')).toHaveAttribute('src', '/icons/kairos-icon-192.png');
    preparing.unmount();

    const failed = render(<ActivationBootstrap databaseStartup={Promise.resolve({ state: 'error', schemaVersion: 1 })} journal={journal}><h2>Journal core</h2></ActivationBootstrap>);
    expect(await screen.findByRole('heading', { level: 1, name: 'Kairos can’t open yet' })).toBeInTheDocument();
    expect(failed.container.querySelector('img')).toHaveAttribute('src', '/icons/kairos-icon-192.png');
    expect(failed.container.querySelector('img')).toHaveAttribute('alt', '');
    expect(journal.load).not.toHaveBeenCalled();
  });

  it('"Lost access?" opens the four steps and closes them again', async () => {
    render(<ActivationGate controller={controller()} appVersion="0.1" buildId="test"><h2>Journal core</h2></ActivationGate>);
    const button = await screen.findByRole('button', { name: LOST_ACCESS });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const steps = within(screen.getByRole('list')).getAllByRole('listitem').map((step) => step.textContent);
    expect(steps).toEqual([
      'Type your invite code again. One code works on up to 3 devices.',
      'Kairos opens with an empty journal. To bring yours back: More › Backup and restore › Replace everything with a backup, then choose your latest backup file.',
      'All 3 in use? On a device you still use: More › Profile › Your devices › Remove. No device left? Ask the person who gave you the code to free one.',
      "Your journal lives only on your devices and in your backup files. The Kairos server never has a copy. Add Kairos to your Home Screen and keep a backup, so this doesn't happen again.",
    ]);
    expect(screen.getByRole('list').id).toBe(button.getAttribute('aria-controls'));

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('opens "Lost access?" by itself when the code is used on all its devices', async () => {
    const gate = controller({ activate: vi.fn(async () => refused({ ok: false, reason: 'already-used', deviceLimit: 3 })) });
    render(<ActivationGate controller={gate} appVersion="0.1" buildId="test"><h2>Journal core</h2></ActivationGate>);
    await screen.findByRole('heading', { name: 'Welcome to Kairos' });
    await submitCode();

    expect(await screen.findByRole('alert')).toHaveTextContent('This code is already used on 3 devices.');
    expect(screen.getByRole('button', { name: LOST_ACCESS })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/^All 3 in use\?/)).toBeVisible();
  });

  it('says "all its devices" when the server names no number, and the steps keep the usual 3', async () => {
    const gate = controller({ activate: vi.fn(async () => refused({ ok: false, reason: 'already-used' })) });
    render(<ActivationGate controller={gate} appVersion="0.1" buildId="test"><h2>Journal core</h2></ActivationGate>);
    await screen.findByRole('heading', { name: 'Welcome to Kairos' });
    await submitCode();

    expect(await screen.findByRole('alert')).toHaveTextContent('This code is already used on all its devices.');
    expect(screen.getByText('Type your invite code again. One code works on up to 3 devices.')).toBeVisible();
  });

  it('gives a code for one device its own words: no "up to 1 device", no "All 1 in use?"', async () => {
    const gate = controller({ activate: vi.fn(async () => refused({ ok: false, reason: 'already-used', deviceLimit: 1 })) });
    render(<ActivationGate controller={gate} appVersion="0.1" buildId="test"><h2>Journal core</h2></ActivationGate>);
    await screen.findByRole('heading', { name: 'Welcome to Kairos' });
    await submitCode();

    expect(await screen.findByRole('alert')).toHaveTextContent('This code is already used on 1 device.');
    expect(screen.getByRole('button', { name: LOST_ACCESS })).toHaveAttribute('aria-expanded', 'true');
    const steps = within(screen.getByRole('list')).getAllByRole('listitem').map((step) => step.textContent);
    expect(steps[0]).toBe('Type your invite code again. This code works on one device only.');
    expect(steps[2]).toBe('Already in use on another device? Ask the person who gave you the code to free it.');
    expect(steps.join(' ')).not.toMatch(/up to 1 device|All 1 in use/);
  });

  it('keeps focus on the button and says "Checking code…" while the code is checked', async () => {
    let answer!: (value: ActivationSnapshot) => void;
    const activate = vi.fn(() => new Promise<ActivationSnapshot>((resolve) => { answer = resolve; }));
    render(<ActivationGate controller={controller({ activate })} appVersion="0.1" buildId="test"><h2>Journal core</h2></ActivationGate>);
    await screen.findByRole('heading', { name: 'Welcome to Kairos' });
    fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: 'ABCD' } });
    const button = screen.getByRole('button', { name: 'Activate Kairos' });
    button.focus();
    fireEvent.submit(button.closest('form')!);

    expect(button).toHaveTextContent('Checking code…');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveFocus();
    fireEvent.submit(button.closest('form')!);
    expect(activate).toHaveBeenCalledTimes(1);

    await act(async () => { answer(refused({ ok: false, reason: 'invalid-code' })); });
    expect(button).toHaveTextContent('Activate Kairos');
    expect(button).toHaveFocus();
  });

  it('offers no copy when this device has no journal', async () => {
    const db = await database();
    const journal = journalOf(db);
    const load = vi.spyOn(journal, 'load');
    render(<ActivationGate controller={controller()} appVersion="0.1" buildId="test" journal={journal}><h2>Journal core</h2></ActivationGate>);
    await screen.findByRole('heading', { name: 'Welcome to Kairos' });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await act(async () => { await load.mock.results[0]!.value; });

    expect(screen.queryByText(/Your journal is still on this device/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download a copy of my data' })).not.toBeInTheDocument();
  });

  it('says when the journal on this device was last backed up', async () => {
    const journal: ActivationJournalPort = {
      load: vi.fn(async () => ({ lastBackupAt: '2026-10-03T08:00:00.000Z', tradesSince: 12, timeZone: 'Asia/Manila' })),
      downloadCopy: vi.fn(),
    };
    render(<ActivationGate controller={controller()} appVersion="0.1" buildId="test" journal={journal}><h2>Journal core</h2></ActivationGate>);
    expect(await screen.findByText('Your journal is still on this device. Last backup: 3 Oct (12 trades since).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download a copy of my data' })).toBeInTheDocument();
  });

  it('"Download a copy of my data" downloads a backup and says so, or says it could not', async () => {
    const db = await database();
    await oneTrade(db);
    const journal = journalOf(db);
    render(<ActivationGate controller={controller()} appVersion="0.1" buildId="test" journal={journal}><h2>Journal core</h2></ActivationGate>);
    expect(await screen.findByText('Your journal is still on this device. No backup yet.')).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Download a copy of my data' })); });
    expect(await screen.findByRole('status')).toHaveTextContent('Downloaded kairos-backup-2026-10-24T01-00-00Z.json.');
    expect(journal.downloaded).toEqual(['kairos-backup-2026-10-24T01-00-00Z.json']);
    // A copy is a backup: the sentence reads again.
    expect(await screen.findByText('Your journal is still on this device. Last backup: 24 Oct (no trades since).')).toBeInTheDocument();
    cleanup();

    const failingDb = await database();
    await oneTrade(failingDb);
    const failing = journalOf(failingDb, true);
    render(<ActivationGate controller={controller()} appVersion="0.1" buildId="test" journal={failing}><h2>Journal core</h2></ActivationGate>);
    const download = await screen.findByRole('button', { name: 'Download a copy of my data' });
    await act(async () => { fireEvent.click(download); });
    expect(await screen.findByRole('status')).toHaveTextContent('Kairos could not make a copy. Nothing was changed.');
    expect(screen.getByRole('status')).toHaveClass('kairos-activation__problem');
  });

  it('passes axe at 390 px with the steps open and the copy offered', async () => {
    window.innerWidth = 390;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
    const db = await database();
    await oneTrade(db);
    const gate = controller({ activate: vi.fn(async () => refused({ ok: false, reason: 'already-used', deviceLimit: 3 })) });
    const { container } = render(<ActivationGate controller={gate} appVersion="0.1" buildId="test" journal={journalOf(db)}><h2>Journal core</h2></ActivationGate>);
    await screen.findByText('Your journal is still on this device. No backup yet.');
    await submitCode();
    expect(screen.getByRole('button', { name: LOST_ACCESS })).toHaveAttribute('aria-expanded', 'true');

    expect(await axeViolations(container)).toEqual([]);
  });
});
