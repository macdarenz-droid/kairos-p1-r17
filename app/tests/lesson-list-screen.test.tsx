import { cleanup, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { appRoutes } from '../src/app/routes';
import { lessonCatalogLinks, readLessonCatalog } from '../src/application/learn/lessons';
import { parseLessonCatalog } from '../src/domain/learn/lessons';
import { ThemeProvider } from '../src/design-system/themes';
import { LessonListScreen } from '../src/features/learn/LessonListScreen';

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => null,
}));

afterEach(cleanup);
beforeAll(async () => { await import('../src/features/learn/LessonListScreen'); }, 30_000);

const textStep = (id: string) => ({ id, title: `Step ${id}`, blocks: [{ kind: 'text', text: 'Some words.' }] });
const withPicture = {
  id: 'first-lesson', revision: 1, title: 'First lesson', summary: 'Where the stop goes.', level: 1, minutes: 3,
  steps: [textStep('one'), { id: 'two', title: 'Two', blocks: [{ kind: 'picture', picture: { kind: 'candle', direction: 'up' }, caption: null }] }],
};
const withoutPicture = { id: 'second-lesson', revision: 1, title: 'Second lesson', summary: 'A short one.', level: 2, minutes: 1, steps: [textStep('one'), textStep('two')] };
const mount = (lessons: unknown[]) => render(<MemoryRouter><LessonListScreen catalog={parseLessonCatalog({ version: 1, lessons }, lessonCatalogLinks())} /></MemoryRouter>);

describe('P25.4 Lessons page', () => {
  it('opens at /library/lessons under the Library tab with every shipped lesson', async () => {
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/library/lessons'] });
    render(<ThemeProvider><RouterProvider router={router} /></ThemeProvider>);
    expect(await screen.findByRole('heading', { level: 1, name: 'Lessons' })).toBeTruthy();
    const { lessons } = readLessonCatalog();
    const links = within(screen.getByRole('list')).getAllByRole('link');
    expect(links).toHaveLength(lessons.length);
    // The accessible name (the picture is aria-hidden) starts with the title.
    const escaped = lessons[0].title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(within(screen.getByRole('list')).getAllByRole('link', { name: new RegExp(`^${escaped}`) })[0]).toBe(links[0]);
    expect(screen.getAllByRole('link', { name: 'Library' }).some((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
  });

  it('lists lessons in file order with their picture, sentence and facts', () => {
    mount([withPicture, withoutPicture]);
    const links = within(screen.getByRole('list')).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/library/lessons/first-lesson', '/library/lessons/second-lesson']);
    const [first, second] = links;
    expect(within(first).getByText('Where the stop goes.')).toBeTruthy();
    expect(within(first).getByText('Level 1 · about 3 minutes · 2 steps')).toBeTruthy();
    expect(first.querySelectorAll('[data-picture]')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /^First lesson/ })).toBe(first);
    expect(within(second).getByText('Level 2 · about 1 minute · 2 steps')).toBeTruthy();
    expect(second.querySelector('[data-picture]')).toBeNull();
    expect(screen.getByText('Short lessons with pictures, a few minutes each. Your answers are not saved.')).toBeTruthy();
  });

  it('shows the good lessons when some are broken, and says when there are none', () => {
    mount([withoutPicture, { id: 'Bad Id' }]);
    expect(screen.getByText('Some lessons could not be shown.')).toBeTruthy();
    expect(within(screen.getByRole('list')).getAllByRole('link')).toHaveLength(1);
    cleanup();
    mount([]);
    expect(screen.getByText('No lessons in this version yet.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
