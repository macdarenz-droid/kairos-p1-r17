import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { AppShell, JOURNAL_CHANGED_EVENT } from '../src/app/AppShell';
import { JournalRoute } from '../src/app/JournalRoute';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, KAIROS_JOURNAL_CHANNEL, listenForKairosJournalChanges, openKairosDatabase, runKairosAtomicWrite, type KairosDatabase } from '../src/data/database';

const names: string[] = [];
const opened: Dexie[] = [];
const closing: Array<() => void> = [];
afterEach(async () => {
  cleanup();
  for (const close of closing.splice(0)) close();
  for (const db of opened.splice(0)) db.close();
  for (const name of names.splice(0)) await Dexie.delete(name);
});
async function database(): Promise<KairosDatabase> {
  const name = `kairos-journal-changed-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  return db;
}
/** Another tab of Kairos: its own channel, the messages it heard, and a way to post. */
function otherTab() {
  const channel = new BroadcastChannel(KAIROS_JOURNAL_CHANNEL);
  const heard: unknown[] = [];
  channel.addEventListener('message', event => heard.push((event as MessageEvent).data));
  closing.push(() => channel.close());
  return { heard, post: () => channel.postMessage({ type: 'changed' }) };
}
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
const note = { key: 'device.test.v1', value: '{}', updatedAt: '2026-10-23T10:00:00.000Z' };

describe('T-054d other tabs hear each save', () => {
  it('a committed write posts once to the other tabs, a failed one never, and a tab never hears itself', async () => {
    const db = await database();
    let heardHere = 0;
    closing.push(listenForKairosJournalChanges(() => { heardHere += 1; }));
    const other = otherTab();
    await runKairosAtomicWrite(db, ['metadata'], ({ repositories }) => repositories.metadata.put(note));
    await settle();
    expect(other.heard).toEqual([{ type: 'changed' }]);
    await expect(runKairosAtomicWrite(db, ['metadata'], async () => { throw new Error('refused'); })).rejects.toThrow();
    await settle();
    expect(other.heard).toHaveLength(1);
    expect(heardHere).toBe(0);
  });

  it('the shell turns another tab\'s message into one window event', async () => {
    let events = 0;
    const count = () => { events += 1; };
    window.addEventListener(JOURNAL_CHANGED_EVENT, count);
    closing.push(() => window.removeEventListener(JOURNAL_CHANGED_EVENT, count));
    render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <AppShell />, children: [{ index: true, element: <h1>Page</h1> }] }], { initialEntries: ['/'] })} />);
    await screen.findByRole('heading', { level: 1, name: 'Page' });
    otherTab().post();
    await waitFor(() => expect(events).toBe(1));
    await settle();
    expect(events).toBe(1);
  });

  it('the Journal\'s list reads again on it', async () => {
    const db = await database();
    render(<MemoryRouter><JournalRoute db={db} now={() => '2026-10-23T10:00:00.000Z'} /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Save trade' });
    await settle();
    // Saved in another tab: this tab's list has not read it.
    expect((await saveManualTrade(db, { symbol: 'OTHERTAB', marketType: 'crypto', side: 'long', status: 'cancelled', openedAt: '2026-10-23T09:00:00.000Z' }, { now: () => '2026-10-23T09:30:00.000Z' })).ok).toBe(true);
    await settle();
    expect(screen.queryByText('OTHERTAB')).toBeNull();
    act(() => { window.dispatchEvent(new Event(JOURNAL_CHANGED_EVENT)); });
    expect(await screen.findByText('OTHERTAB')).toBeInTheDocument();
  });
});
