import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LibraryRoute } from '../src/app/LibraryRoute';
import { appRoutes } from '../src/app/routes';
import { lessonCatalogLinks, readLessonCatalog } from '../src/application/learn/lessons';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { parseLessonCatalog, type LessonCatalog } from '../src/domain/learn/lessons';
import { ThemeProvider } from '../src/design-system/themes';
import { LessonReaderScreen } from '../src/features/learn/LessonReaderScreen';

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => null,
}));

const names: string[] = [];
afterEach(async () => { cleanup(); for (const name of names.splice(0)) await Dexie.delete(name); });
beforeAll(async () => { await import('../src/features/learn/LessonReaderScreen'); }, 30_000);

const check = {
  kind: 'check', question: 'Where does the stop go?',
  choices: [{ text: 'Below', right: true }, { text: 'Above', right: false }], explanation: 'On a buy it sits below.',
};
const fixture: LessonCatalog = parseLessonCatalog({ version: 1, lessons: [
  { id: 'first', revision: 1, title: 'First lesson', summary: 'One.', level: 1, minutes: 3, steps: [
    { id: 'a', title: 'Step A title', blocks: [{ kind: 'text', text: 'Words of step A.' }] },
    { id: 'b', title: 'Step B title', blocks: [check] },
    { id: 'c', title: 'Step C title', blocks: [{ kind: 'try', text: 'Log a trade.', tool: 'journal' }] },
  ] },
  { id: 'second', revision: 1, title: 'Second lesson', summary: 'Two.', level: 1, minutes: 2, steps: [
    { id: 'x', title: 'Step X title', blocks: [{ kind: 'text', text: 'Words of step X.' }] },
    { id: 'y', title: 'Step Y title', blocks: [{ kind: 'text', text: 'Words of step Y.' }] },
  ] },
] }, lessonCatalogLinks());

function mount(path: string, catalog: LessonCatalog = fixture) {
  const router = createMemoryRouter([
    { path: '/library/lessons', element: <p>All lessons page</p> },
    { path: '/library/lessons/:lessonId', element: <LessonReaderScreen catalog={catalog} /> },
    { path: '/journal', element: <p>Journal page</p> },
  ], { initialEntries: ['/library/lessons', path], initialIndex: 1 });
  render(<RouterProvider router={router} />);
  return router;
}
const h2 = () => screen.getByRole('heading', { level: 2 });
const dots = () => [...document.querySelectorAll('.kairos-lesson__dots li')].map((dot) => dot.getAttribute('data-state'));
const click = (name: string) => act(async () => { fireEvent.click(screen.getByRole('button', { name })); });

describe('P25.5 the lesson reader', () => {
  it('opens on step 1', () => {
    mount('/library/lessons/first');
    expect(screen.getByRole('heading', { level: 1, name: 'First lesson' })).toBeTruthy();
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
    expect(h2().textContent).toBe('Step A title');
    expect(dots()).toEqual(['current', 'todo', 'todo']);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
  });

  it('moves one step at a time and focuses each new title', async () => {
    const router = mount('/library/lessons/first');
    await click('Next');
    expect(router.state.location.search).toBe('?step=2');
    expect(screen.getByText('Step 2 of 3')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Step B title' }));
    expect(dots()).toEqual(['done', 'current', 'todo']);
    await click('Back');
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Step A title' }));
  });

  it('keeps answers for the visit', async () => {
    mount('/library/lessons/first?step=2');
    await click('Above');
    expect(screen.getByText(/Not quite\./)).toBeTruthy();
    await click('Next');
    await click('Back');
    expect(screen.getByText(/Not quite\./)).toBeTruthy();
  });

  it('finishes, links the next lesson and starts again with no answers', async () => {
    const router = mount('/library/lessons/first?step=2');
    await click('Below');
    await click('Next');
    expect(screen.getByRole('button', { name: 'Finish' })).toBeTruthy();
    await click('Finish');
    expect(router.state.location.search).toBe('?step=done');
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Lesson finished' }));
    expect(screen.getByText('All 3 steps done')).toBeTruthy();
    expect(dots()).toEqual(['done', 'done', 'done']);
    expect(screen.getByRole('link', { name: 'Next lesson: Second lesson' }).getAttribute('href')).toBe('/library/lessons/second');
    await click('Start again');
    expect(router.state.location.search).toBe('?step=1');
    await click('Next');
    expect(screen.getByRole('group', { name: check.question }).querySelector('.kairos-lesson-check__feedback')!.textContent).toBe('');
  });

  it('leaves the lesson with one system back', async () => {
    const router = mount('/library/lessons/first');
    await click('Next');
    await click('Next');
    await act(async () => { await router.navigate(-1); });
    expect(screen.getByText('All lessons page')).toBeTruthy();
  });

  it('opens a step from the address and falls back to step 1', () => {
    mount('/library/lessons/first?step=3');
    expect(h2().textContent).toBe('Step C title');
    for (const step of ['0', '9', 'abc', '1.5']) {
      cleanup();
      mount(`/library/lessons/first?step=${step}`);
      expect(screen.getByText('Step 1 of 3')).toBeTruthy();
    }
  });

  it('has no next lesson after the last one', () => {
    mount('/library/lessons/second?step=done');
    expect(screen.getByRole('heading', { level: 2, name: 'Lesson finished' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Next lesson/ })).toBeNull();
  });

  it('opens the next lesson on its first step', async () => {
    mount('/library/lessons/first?step=done');
    await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Next lesson: Second lesson' })); });
    expect(screen.getByRole('heading', { level: 1, name: 'Second lesson' })).toBeTruthy();
    expect(screen.getByText('Step 1 of 2')).toBeTruthy();
  });

  it('says when the lesson is unknown', () => {
    mount('/library/lessons/nope');
    expect(screen.getByText('That lesson is not in the list yet.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'All lessons' }).getAttribute('href')).toBe('/library/lessons');
  });

  it('is linked first from the Library', async () => {
    const name = `kairos-lessons-library-${crypto.randomUUID()}`; names.push(name);
    const db = createKairosDatabase(name); await openKairosDatabase(db);
    render(<MemoryRouter><LibraryRoute db={db} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /^Lessons/ }).getAttribute('href')).toBe('/library/lessons');
    expect(screen.getByRole('link', { name: /^Trading words/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Calculators/ })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('region', { name: 'Library' }).getAttribute('data-library-status')).toBe('ready'));
  });

  it('opens a shipped lesson on the real route under the Library tab', async () => {
    const first = readLessonCatalog().lessons[0];
    const router = createMemoryRouter(appRoutes, { initialEntries: [`/library/lessons/${first.id}`] });
    render(<ThemeProvider><RouterProvider router={router} /></ThemeProvider>);
    expect(await screen.findByRole('heading', { level: 1, name: first.title })).toBeTruthy();
    expect(screen.getByText(`Step 1 of ${first.steps.length}`)).toBeTruthy();
    expect(within(document.body).getAllByRole('link', { name: 'Library' }).some((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
  });
});
