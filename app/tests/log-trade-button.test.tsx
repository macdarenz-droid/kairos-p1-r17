import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { createMemoryRouter, matchRoutes, RouterProvider } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../src/app/AppShell';
import { appRoutes } from '../src/app/routes';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { Button, Sheet } from '../src/design-system/primitives';
import manifestText from '../public/manifest.webmanifest?raw';

const names: string[] = [];
const opened: Dexie[] = [];
// jsdom does not scroll: the call is recorded instead.
const scrolled = vi.fn();
beforeAll(async () => {
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element, options?: boolean | ScrollIntoViewOptions) { scrolled(this, options); };
  await import('../src/app/JournalRoute');
}, 30_000);
afterEach(async () => { cleanup(); scrolled.mockClear(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-log-trade-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  return db;
}

function PageWithSheet() {
  const [open, setOpen] = useState(false);
  return <>
    <h1>Analysis</h1>
    <Button onClick={() => setOpen(true)}>How it works</Button>
    <Sheet open={open} title="How it works" onClose={() => setOpen(false)}><p>Inside.</p></Sheet>
  </>;
}

async function shell(db: KairosDatabase, initialEntries: string[]) {
  const { JournalRoute } = await import('../src/app/JournalRoute');
  const router = createMemoryRouter([{
    element: <AppShell />,
    children: [
      { path: '/', element: <h1>Home</h1> },
      { path: '/journal', element: <JournalRoute db={db} /> },
      { path: '/analysis', element: <PageWithSheet /> },
      { path: '/practice', element: <h1>Practice</h1> },
      { path: '/more', element: <h1>More</h1> },
    ],
  }], { initialEntries, initialIndex: initialEntries.length - 1 });
  render(<RouterProvider router={router} />);
  return router;
}
const logButton = () => screen.queryByRole('link', { name: 'Log trade' });
const symbol = () => screen.getByRole('combobox', { name: /^Symbol/ });

describe('T-053e "+ Log trade"', () => {
  it('is on Home, the Journal and Analysis, and not on Practice or More', async () => {
    const db = await database();
    for (const path of ['/', '/journal', '/analysis']) {
      await shell(db, [path]);
      expect(await screen.findByRole('link', { name: 'Log trade' }), path).toHaveAttribute('href', '/journal?log=1');
      cleanup();
    }
    for (const path of ['/practice', '/more']) {
      await shell(db, [path]);
      await screen.findByRole('heading', { level: 1 });
      expect(logButton(), path).toBeNull();
      cleanup();
    }
  });

  it('from Home opens the Journal with Symbol focused and the form brought into view, and leaves "log" out of the address', async () => {
    const router = await shell(await database(), ['/']);
    fireEvent.click(await screen.findByRole('link', { name: 'Log trade' }));
    await waitFor(() => expect(document.activeElement).toBe(symbol()));
    expect(scrolled).toHaveBeenCalledWith(symbol(), { block: 'start' });
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(router.state.location.pathname).toBe('/journal');
    // Back returns to Home, not to a Journal that focuses Symbol again.
    await act(async () => { await router.navigate(-1); });
    expect(router.state.location.pathname).toBe('/');
  });

  it('on the Journal focuses Symbol without adding a step to Back', async () => {
    const router = await shell(await database(), ['/', '/journal']);
    await screen.findByRole('heading', { name: 'Journal' });
    fireEvent.click(screen.getByRole('link', { name: 'Log trade' }));
    await waitFor(() => expect(document.activeElement).toBe(symbol()));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    await act(async () => { await router.navigate(-1); });
    expect(router.state.location.pathname).toBe('/');
  });

  it('opened directly at /journal?log=1, focuses Symbol and leaves "log" out of the address', async () => {
    const router = await shell(await database(), ['/journal?log=1&status=open']);
    await waitFor(() => expect(document.activeElement).toBe(symbol()));
    await waitFor(() => expect(router.state.location.search).toBe('?status=open'));
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('is hidden while a sheet is open', async () => {
    await shell(await database(), ['/analysis']);
    expect(await screen.findByRole('link', { name: 'Log trade' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'How it works' }));
    await screen.findByRole('dialog', { name: 'How it works' });
    await waitFor(() => expect(logButton()).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByRole('link', { name: 'Log trade' })).toBeInTheDocument();
  });
});

describe('T-053e the "Log a trade" app shortcut', () => {
  it('opens a Journal address that brings the trade form up', () => {
    const manifest = JSON.parse(manifestText) as { shortcuts?: { name: string; short_name: string; url: string; icons: { src: string }[] }[] };
    expect(manifest.shortcuts).toHaveLength(1);
    const [shortcut] = manifest.shortcuts!;
    expect(shortcut).toMatchObject({ name: 'Log a trade', short_name: 'Log trade' });
    const address = new URL(shortcut.url, 'https://kairos.example');
    expect(address.searchParams.get('log')).toBe('1');
    expect(matchRoutes(appRoutes, address.pathname)?.at(-1)?.route.path).toBe('journal');
    expect(shortcut.icons[0].src).toMatch(/^\/icons\//);
  });
});
