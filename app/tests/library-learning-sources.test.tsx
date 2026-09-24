import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { LibraryRoute } from '../src/app/LibraryRoute';
import { learningSourceHref, readLearningSourceCatalog, type LearningSourceCache, type LearningSourceDevice } from '../src/application/library';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { parseLearningSourceCatalog, type LearningSource } from '../src/domain/library/learningSources';
import { LearningSources } from '../src/features/library/LearningSources';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-library-sources-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const sample = readLearningSourceCatalog().sources.find(source => source.id === 'kairos-library-sample')!;
const href = learningSourceHref(sample);
const notSaved = "Not saved on this device. It opens when you're online.";

function fakeCache() {
  const store = new Map<string, Response>();
  const keyOf = (request: string | Request) => { const url = new URL(typeof request === 'string' ? request : request.url, 'https://kairos.test'); return url.pathname + url.search; };
  const cache: LearningSourceCache & { store: Map<string, Response> } = {
    store,
    keys: async () => [...store.keys()].map(key => new Request(new URL(key, 'https://kairos.test'))),
    match: async url => store.get(keyOf(url))?.clone(),
    put: async (url, response) => { store.set(keyOf(url), response); },
    delete: async request => store.delete(keyOf(request)),
  };
  return cache;
}
function fakeDevice(overrides: Partial<LearningSourceDevice> = {}, cache = fakeCache()) {
  const download = vi.fn(async (_href: string) => new Response('%PDF-'.padEnd(1212, ' ')));
  const device: LearningSourceDevice = { openCache: async () => cache, download, sha256Hex: async () => sample.revision.sha256, freeSpace: async () => null, ...overrides };
  return { device, cache, download };
}
const card = () => document.querySelector<HTMLElement>('[data-learning-source-id="kairos-library-sample"]')!;
async function mountLibrary(device: LearningSourceDevice, db?: KairosDatabase) {
  render(<MemoryRouter><LibraryRoute db={db ?? await database()} learningSourceDevice={device} /></MemoryRouter>);
}

describe('T-034c Library learning sources', () => {
  it('shows both sections and the sample card with its provenance and link', async () => {
    const { device } = fakeDevice();
    await mountLibrary(device);
    expect(screen.getByRole('heading', { level: 1, name: 'Library' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Your saved charts' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Learning sources' })).toBeTruthy();
    const heading = within(card()).getByRole('heading', { level: 3, name: 'How the Library works' });
    expect(heading.getAttribute('lang')).toBe('en');
    expect(within(card()).getByText(sample.covers)).toBeTruthy();
    expect(within(card()).getByText("By Kairos · Written for Kairos as the Library's sample file")).toBeTruthy();
    expect(within(card()).getByText('PDF · 1 KB · 1 page')).toBeTruthy();
    const link = within(card()).getByRole('link', { name: 'Open PDF: How the Library works (opens in a new tab)' });
    expect(link.getAttribute('href')).toBe('/library/sources/kairos-library-sample.pdf?rev=46b31007ebb63e86');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('saves after the check and removes again, never touching the journal', async () => {
    const db = await database();
    const { device, cache, download } = fakeDevice();
    await mountLibrary(device, db);
    await waitFor(() => expect(within(card()).getByText(notSaved)).toBeTruthy());
    await act(async () => { fireEvent.click(within(card()).getByRole('button', { name: 'Save for offline: How the Library works' })); });
    await waitFor(() => expect(within(card()).getByText('Saved for offline')).toBeTruthy());
    expect(card().getAttribute('data-offline-state')).toBe('saved');
    expect(cache.store.has(href)).toBe(true);
    expect(download).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith(href);
    await act(async () => { fireEvent.click(within(card()).getByRole('button', { name: 'Remove from this device: How the Library works' })); });
    await waitFor(() => expect(within(card()).getByText(notSaved)).toBeTruthy());
    expect(cache.store.size).toBe(0);
    for (const table of db.tables) expect(await table.count()).toBe(0);
  });

  it('shows a source already saved on this device after checking', async () => {
    const cache = fakeCache();
    cache.store.set(href, new Response('%PDF-'));
    const { device } = fakeDevice({}, cache);
    await mountLibrary(device);
    expect(within(card()).getByText('Checking this device…')).toBeTruthy();
    await waitFor(() => expect(within(card()).getByText('Saved for offline')).toBeTruthy());
  });

  it('offers to try again after a failed download', async () => {
    const { device, download } = fakeDevice();
    download.mockRejectedValueOnce(new TypeError('offline'));
    await mountLibrary(device);
    await waitFor(() => expect(within(card()).getByText(notSaved)).toBeTruthy());
    await act(async () => { fireEvent.click(within(card()).getByRole('button', { name: 'Save for offline: How the Library works' })); });
    await waitFor(() => expect(within(card()).getByText("Couldn't download it. Check your internet and try again.")).toBeTruthy());
    await act(async () => { fireEvent.click(within(card()).getByRole('button', { name: 'Try again: save How the Library works for offline' })); });
    await waitFor(() => expect(within(card()).getByText('Saved for offline')).toBeTruthy());
  });

  it('refuses a file that does not match and keeps room for the journal', async () => {
    const mismatch = fakeDevice({ sha256Hex: async () => '0'.repeat(64) });
    await mountLibrary(mismatch.device);
    await waitFor(() => expect(within(card()).getByText(notSaved)).toBeTruthy());
    await act(async () => { fireEvent.click(within(card()).getByRole('button', { name: 'Save for offline: How the Library works' })); });
    await waitFor(() => expect(within(card()).getByText("The downloaded file didn't match the Library's record, so it wasn't saved.")).toBeTruthy());
    expect(mismatch.cache.store.size).toBe(0);
    cleanup();
    const tight = fakeDevice({ freeSpace: async () => 1 });
    await mountLibrary(tight.device);
    await waitFor(() => expect(within(card()).getByText(notSaved)).toBeTruthy());
    await act(async () => { fireEvent.click(within(card()).getByRole('button', { name: 'Save for offline: How the Library works' })); });
    await waitFor(() => expect(within(card()).getByText('Not enough free space on this device. Kairos keeps room for your journal.')).toBeTruthy());
    expect(tight.download).not.toHaveBeenCalled();
  });

  it('still opens a source when this browser cannot keep files', async () => {
    const { device } = fakeDevice({ openCache: null });
    await mountLibrary(device);
    expect(within(card()).getByText("This browser can't keep files for offline reading. It opens when you're online.")).toBeTruthy();
    expect(within(card()).queryByRole('button')).toBeNull();
    expect(within(card()).getByRole('link', { name: /Open PDF/ })).toBeTruthy();
  });

  it('shows the valid sources of a damaged catalog and says when there are none', () => {
    const { device } = fakeDevice({ openCache: null });
    const valid = { id: 'guide', title: 'A guide', covers: 'What it covers.', author: null, origin: 'Test', rights: null, language: 'en', revision: { number: 1, fileName: 'guide.pdf', bytes: 2000, sha256: sample.revision.sha256, pages: null, addedOn: '2026-09-24' } };
    const view = render(<LearningSources catalog={parseLearningSourceCatalog({ version: 1, sources: [valid, { id: 'x' }] })} device={device} />);
    expect(screen.getByRole('heading', { level: 3, name: 'A guide' })).toBeTruthy();
    expect(screen.getByText('Author not recorded · Test')).toBeTruthy();
    expect(screen.getByText('PDF · 2 KB')).toBeTruthy();
    expect(screen.getByText('Some learning sources could not be shown.')).toBeTruthy();
    view.rerender(<LearningSources catalog={parseLearningSourceCatalog({ version: 1, sources: [] })} device={device} />);
    cleanup();
    render(<LearningSources catalog={parseLearningSourceCatalog({ version: 1, sources: [] })} device={device} />);
    expect(screen.getByText('No learning sources in this version yet.')).toBeTruthy();
  });

  it('keeps a failure inside the section', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = { ...sample, get title(): string { throw new Error('broken'); } } as LearningSource;
    const { device } = fakeDevice({ openCache: null });
    render(<LearningSources catalog={{ sources: [broken], problems: [] }} device={device} />);
    expect(screen.getByText("Learning sources can't be shown right now. Your journal and saved charts are not affected.")).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Learning sources' })).toBeTruthy();
  });
});
