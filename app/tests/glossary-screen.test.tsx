import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, MemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { LibraryRoute } from '../src/app/LibraryRoute';
import { appRoutes } from '../src/app/routes';
import { readGlossary } from '../src/application/learn/glossary';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { parseGlossary } from '../src/domain/learn/glossary';
import { ThemeProvider } from '../src/design-system/themes';
import { GlossaryScreen } from '../src/features/learn/GlossaryScreen';

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => null,
}));

const names: string[] = [];
afterEach(async () => { cleanup(); for (const name of names.splice(0)) await Dexie.delete(name); });

beforeAll(async () => { await import('../src/features/learn/GlossaryScreen'); }, 30_000);

const word = (id: string, plainWords: string, overrides: Record<string, unknown> = {}) => ({
  id, plainWords, tradingTerm: `Term ${id}`, alsoCalled: [], explanation: `About ${plainWords}.`, picture: null, related: [], ...overrides,
});
const fixture = parseGlossary({ version: 1, terms: [
  word('result-after-fees', 'Result after fees', { alsoCalled: ['net PnL'], related: ['fees'] }),
  word('fees', 'Fees', { tradingTerm: 'Trading fees' }),
  word('result-before-fees', 'Result before fees'),
  word('stop', 'Stop', { related: ['target', 'position-size'] }),
  word('target', 'Target', { related: ['stop'] }),
  word('position-size', 'Size', { tradingTerm: 'Position size', related: ['stop'] }),
] });
const cards = () => screen.getAllByRole('article').map((card) => card.getAttribute('data-term-id'));
const card = (name: string) => screen.getByRole('article', { name });
const mount = (path = '/library/words', glossary = fixture) => render(<MemoryRouter initialEntries={[path]}><GlossaryScreen glossary={glossary} /></MemoryRouter>);

describe('P24.5 Trading words page', () => {
  it('opens at /library/words with every shipped word under the Library tab', async () => {
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/library/words'] });
    render(<ThemeProvider><RouterProvider router={router} /></ThemeProvider>);
    expect(await screen.findByRole('heading', { level: 1, name: 'Trading words' })).toBeTruthy();
    const count = readGlossary().terms.length;
    expect(screen.getByText(`${count} words`)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Library' }).some((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
  });

  it('searches as you type', () => {
    mount();
    expect(screen.getByText('6 words')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a word' }), { target: { value: 'fee' } });
    expect(cards()).toEqual(['fees', 'result-after-fees', 'result-before-fees']);
    expect(screen.getByText('3 words match "fee"')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a word' }), { target: { value: 'zzz' } });
    expect(screen.getByText('No words match "zzz". Try fewer letters.')).toBeTruthy();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('opens on one word and follows related links', async () => {
    mount('/library/words?term=stop');
    expect(card('Stop').getAttribute('data-selected')).toBe('true');
    expect(document.activeElement).toBe(card('Stop'));
    fireEvent.click(within(card('Stop')).getByRole('link', { name: 'Target' }));
    await waitFor(() => expect(card('Target').getAttribute('data-selected')).toBe('true'));
    expect(card('Stop').getAttribute('data-selected')).toBeNull();
    expect(document.activeElement).toBe(card('Target'));

    const search = screen.getByRole('searchbox', { name: 'Find a word' }) as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'size' } });
    expect(cards()).toEqual(['position-size']);
    fireEvent.click(within(card('Size')).getByRole('link', { name: 'Stop' }));
    await waitFor(() => expect(card('Stop').getAttribute('data-selected')).toBe('true'));
    expect(search.value).toBe('');
    expect(document.activeElement).toBe(card('Stop'));
  });

  it('says when the linked word is not in the list', () => {
    mount('/library/words?term=nope');
    expect(screen.getByText('That word is not in the list yet.')).toBeTruthy();
  });

  it('shows the good words when some are broken, and says when there are none', () => {
    mount('/library/words', parseGlossary({ version: 1, terms: [word('fees', 'Fees'), { id: 'Bad Id' }] }));
    expect(screen.getByText('Some words could not be shown.')).toBeTruthy();
    expect(cards()).toEqual(['fees']);
    cleanup();
    mount('/library/words', parseGlossary({ version: 1, terms: [] }));
    expect(screen.getByText('No words in this version yet.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('links to Trading words from the Library', async () => {
    const name = `kairos-glossary-library-${crypto.randomUUID()}`; names.push(name);
    const db = createKairosDatabase(name); await openKairosDatabase(db);
    render(<MemoryRouter><LibraryRoute db={db} /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 2, name: 'Learn the basics' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Trading words/ }).getAttribute('href')).toBe('/library/words');
    await waitFor(() => expect(screen.getByRole('region', { name: 'Library' }).getAttribute('data-library-status')).toBe('ready'));
  });
});
