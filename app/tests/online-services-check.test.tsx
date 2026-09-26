import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import Dexie from 'dexie';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KairosApiHealth, KairosApiHealthPort, KairosApiResult } from '../src/application/online/onlineWords';
import { ProfileRoute } from '../src/app/ProfileRoute';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { UnavailableNotice } from '../src/design-system/primitives';
import { OnlineServicesCheck } from '../src/features/settings/OnlineServicesCheck';

type HealthResult = KairosApiResult<KairosApiHealth>;
const OK: HealthResult = { ok: true, value: { serverTime: '2026-09-26T10:00:00.000Z', device: 'recognised', checks: { deviceKey: 'ready', cache: 'ready', limits: 'ready' } } };
const OFFLINE: HealthResult = { ok: false, reason: 'transport-failed' };
const OFFLINE_TEXT = 'Unavailable · Online services: Kairos could not reach its server. Check your connection, then try again.';

afterEach(() => cleanup());

/** checkHealth answers with a promise the test resolves inside act. */
function heldPort() {
  const answers: Array<(result: HealthResult) => void> = [];
  const checkHealth = vi.fn<KairosApiHealthPort['checkHealth']>(() => new Promise<HealthResult>((resolve) => { answers.push(resolve); }));
  const port: KairosApiHealthPort = { setUp: true, checkHealth };
  const answer = async (result: HealthResult) => { await act(async () => { answers.shift()!(result); }); };
  return { port, checkHealth, answer };
}

function tap(button: HTMLElement) {
  button.focus();
  fireEvent.click(button);
}

describe('OnlineServicesCheck', () => {
  it('says not set up, with no button, when this build has no server address', () => {
    const checkHealth = vi.fn<KairosApiHealthPort['checkHealth']>();
    render(<OnlineServicesCheck port={{ setUp: false, checkHealth }} />);
    expect(screen.getByText('Online services: not set up in this version of Kairos.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(checkHealth).not.toHaveBeenCalled();
  });

  it('asks only on a tap, keeps the tapped button busy, and moves focus to the new button', async () => {
    const { port, checkHealth, answer } = heldPort();
    render(<OnlineServicesCheck port={port} />);
    expect(checkHealth).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();

    const first = screen.getByRole('button', { name: 'Check online services' });
    tap(first);
    expect(first.isConnected).toBe(true);
    expect(screen.getByRole('button', { name: 'Check online services' })).toBe(first);
    expect((first as HTMLButtonElement).disabled).toBe(true);
    expect(first.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe('Checking online services…');

    await answer(OFFLINE);
    expect(screen.getByRole('alert').textContent).toContain(OFFLINE_TEXT);
    expect(screen.queryByRole('button', { name: 'Check online services' })).toBeNull();
    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(document.activeElement).toBe(retry);

    tap(retry);
    expect(screen.getByRole('button', { name: 'Try again' })).toBe(retry);
    expect((retry as HTMLButtonElement).disabled).toBe(true);
    expect(retry.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('alert').textContent).toContain(OFFLINE_TEXT);

    await answer(OK);
    expect(screen.getByText('Online services are working. This device is recognised.').getAttribute('role')).toBe('status');
    expect(screen.queryByRole('alert')).toBeNull();
    const again = screen.getByRole('button', { name: 'Check again' });
    expect(document.activeElement).toBe(again);

    tap(again);
    expect(screen.getByRole('button', { name: 'Check again' })).toBe(again);
    expect((again as HTMLButtonElement).disabled).toBe(true);
    expect(again.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Online services are working. This device is recognised.')).toBeTruthy();

    await answer(OK);
    expect((again as HTMLButtonElement).disabled).toBe(false);
    expect(document.activeElement).toBe(again);
    expect(checkHealth).toHaveBeenCalledTimes(3);
    for (const [options] of checkHealth.mock.calls) expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it('focuses the line when the answer has no button', async () => {
    const { port, answer } = heldPort();
    const { container } = render(<OnlineServicesCheck port={port} />);
    tap(screen.getByRole('button', { name: 'Check online services' }));
    await answer({ ok: false, reason: 'unavailable', serverReason: 'not-set-up', retryAfterSeconds: null, status: 503 });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(document.activeElement).toBe(container.querySelector('[data-online-services="unavailable"]'));
  });

  it('leaves focus alone when the trader moved it elsewhere', async () => {
    const { port, answer } = heldPort();
    render(<><button type="button">Elsewhere</button><OnlineServicesCheck port={port} /></>);
    tap(screen.getByRole('button', { name: 'Check online services' }));
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();
    await answer(OFFLINE);
    expect(document.activeElement).toBe(elsewhere);
  });

  it('stops the check when it is removed', () => {
    const { port, checkHealth } = heldPort();
    const { unmount } = render(<OnlineServicesCheck port={port} />);
    tap(screen.getByRole('button', { name: 'Check online services' }));
    const signal = checkHealth.mock.calls[0][0]!.signal!;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });
});

describe('UnavailableNotice', () => {
  it('shows Unavailable with the sentence, and a retry button only when it can help', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<UnavailableNotice message="News: the source did not answer." retryLabel="Try again" onRetry={onRetry} />);
    expect(screen.getByRole('alert').textContent).toContain('Unavailable · News: the source did not answer.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(<UnavailableNotice message="News: the source did not answer." retryLabel="Try again" onRetry={onRetry} busy />);
    const busy = screen.getByRole('button', { name: 'Try again' }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');

    rerender(<UnavailableNotice message="News: not set up." retryLabel={null} onRetry={onRetry} />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<UnavailableNotice message="News: not set up." retryLabel="Try again" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Profile', () => {
  const names: string[] = [];
  afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });
  async function database() {
    const name = `kairos-online-services-${crypto.randomUUID()}`;
    names.push(name);
    const db = createKairosDatabase(name);
    await openKairosDatabase(db);
    return db;
  }

  it('shows the online services check in "This device" only when it is given', async () => {
    const checkHealth = vi.fn<KairosApiHealthPort['checkHealth']>();
    const db = await database();
    const { unmount } = render(<MemoryRouter><ProfileRoute db={db} onlineServices={{ setUp: true, checkHealth }} /></MemoryRouter>);
    expect(within(await screen.findByRole('article', { name: 'This device' })).getByRole('button', { name: 'Check online services' })).toBeTruthy();
    unmount();

    render(<MemoryRouter><ProfileRoute db={db} /></MemoryRouter>);
    expect(within(await screen.findByRole('article', { name: 'This device' })).queryByRole('button', { name: 'Check online services' })).toBeNull();
    db.close();
  });
});
