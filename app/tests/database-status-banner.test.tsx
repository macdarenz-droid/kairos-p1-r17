import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunBackupResult } from '../src/application/backup';
import { DatabaseStatusBanner, type DatabaseStatusPort } from '../src/features/shell/DatabaseStatusBanner';
import { axeViolations } from './fixtures/axe';

afterEach(cleanup);

/** A database the test drives: its lifecycle, its failed writes and what "Try again" answers. */
function database(reopenTo = 'ready') {
  let lifecycle: ((status: { readonly state: string }) => void) | null = null;
  let failures: ((kind: 'storage-full' | 'closed' | 'other' | null) => void) | null = null;
  let finishReopen: () => void = () => undefined;
  const reload = vi.fn();
  const reopen = vi.fn(() => new Promise<{ state: string }>(resolve => { finishReopen = () => { lifecycle?.({ state: reopenTo }); resolve({ state: reopenTo }); }; }));
  const port: DatabaseStatusPort = {
    subscribe: listener => { lifecycle = listener; listener({ state: 'ready' }); return () => { lifecycle = null; }; },
    reopen,
    subscribeWriteFailures: listener => { failures = listener; return () => { failures = null; }; },
    downloadReadable: async (): Promise<RunBackupResult> => ({ ok: false, reason: 'delivery-failed' }),
    reload,
  };
  return {
    port, reload, reopen,
    /** States published together, in one tick (as a restore's close and reopen are). */
    publish: (...states: string[]) => act(() => { for (const state of states) lifecycle?.({ state }); }),
    fail: (kind: 'storage-full' | 'closed' | 'other' | null) => act(() => { failures?.(kind); }),
    finishReopen: () => act(async () => { finishReopen(); }),
  };
}
const page = (port: DatabaseStatusPort, onGone = vi.fn()) => {
  render(<main><h1>Page</h1><button type="button">Elsewhere</button><DatabaseStatusBanner port={port} onGone={onGone} /></main>);
  return onGone;
};

describe('T-054d the database status banner', () => {
  it('shows nothing while the database is ready, or while it opens', async () => {
    const db = database();
    page(db.port);
    expect(screen.queryByRole('alert')).toBeNull();
    await db.publish('opening');
    expect(screen.queryByRole('alert')).toBeNull();
    // A failed write of another kind is each screen's own message.
    await db.fail('other');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('another tab updated Kairos: Reload', async () => {
    const db = database();
    const { container } = render(<main><h1>Page</h1><DatabaseStatusBanner port={db.port} /></main>);
    await db.publish('version-change');
    expect(screen.getByRole('alert')).toHaveTextContent('Kairos was updated in another tab. Reload to keep saving.');
    const reload = screen.getByRole('button', { name: 'Reload' });
    reload.focus();
    expect(reload).toHaveFocus();
    fireEvent.click(reload);
    expect(db.reload).toHaveBeenCalledTimes(1);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('the link to the journal was lost (closed, or a write that found it closed): Reload', async () => {
    const db = database();
    page(db.port);
    await db.publish('closed');
    expect(screen.getByRole('alert')).toHaveTextContent('Kairos lost its link to your journal. Reload to keep saving.');
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(db.reload).toHaveBeenCalledTimes(1);
    await db.publish('ready');
    expect(screen.queryByRole('alert')).toBeNull();
    await db.fail('closed');
    expect(screen.getByRole('alert')).toHaveTextContent('Kairos lost its link to your journal. Reload to keep saving.');
    // The link back: the note goes.
    await db.publish('ready');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('an update waits for other tabs: "Try again" opens the journal again and the note goes, moving focus on', async () => {
    const db = database('ready');
    const onGone = page(db.port);
    await db.publish('upgrade-blocked');
    expect(screen.getByRole('alert')).toHaveTextContent('Close other Kairos tabs, then Try again.');
    const retry = screen.getByRole('button', { name: 'Try again' });
    retry.focus();
    fireEvent.click(retry);
    expect(db.reopen).toHaveBeenCalledTimes(1);
    // While it opens the note stays, with the button saying so.
    await db.publish('opening');
    expect(screen.getByRole('button', { name: 'Trying…' })).toHaveAttribute('aria-disabled', 'true');
    await db.finishReopen();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it('"Try again" that still cannot open says so and keeps the button', async () => {
    const db = database('upgrade-blocked');
    const onGone = page(db.port);
    await db.publish('upgrade-blocked');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await db.finishReopen();
    expect(await screen.findByText("Kairos still can't open your journal. Close other Kairos tabs, then Try again.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).not.toHaveAttribute('aria-disabled');
    expect(onGone).not.toHaveBeenCalled();
  });

  it('"lost its link" needs a link first: a journal that never opened shows nothing', async () => {
    const reload = vi.fn();
    page({ subscribe: listener => { listener({ state: 'closed' }); return () => undefined; }, reopen: async () => ({ state: 'ready' }), subscribeWriteFailures: () => () => undefined, downloadReadable: async () => ({ ok: false, reason: 'delivery-failed' }), reload });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a planned close and reopen (a restore) never shows the note', async () => {
    const db = database();
    page(db.port);
    await db.publish('closed', 'opening');
    expect(screen.queryByRole('alert')).toBeNull();
    await db.publish('ready');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('leaves focus alone when the note goes while the trader is elsewhere', async () => {
    const db = database();
    const onGone = page(db.port);
    await db.publish('closed');
    screen.getByRole('button', { name: 'Elsewhere' }).focus();
    await db.publish('ready');
    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
    expect(onGone).not.toHaveBeenCalled();
  });
});
