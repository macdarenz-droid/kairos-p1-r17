import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { navigationTabOf, pageParentOf } from '../src/app/navigation';
import { appRoutes } from '../src/app/routes';

function renderPath(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeAll(async () => {
  await Promise.all([import('../src/app/AnalysisRoute'), import('../src/app/JournalRoute')]);
}, 30_000);

describe('P8.1 navigation shell', () => {
  it('exposes the five primary destinations in one navigation landmark', () => {
    renderPath('/');
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument();
    for (const label of ['Home', 'Journal', 'Analysis', 'Library', 'More']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });
  it('marks the current primary destination with aria-current', async () => {
    renderPath('/analysis');
    expect(await screen.findByRole('link', { name: 'Analysis' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });
  it('navigates without replacing the shared shell', async () => {
    const router = renderPath('/');
    fireEvent.click(screen.getByRole('link', { name: 'Journal' }));
    await screen.findByRole('heading', { name: 'Journal' });
    expect(router.state.location.pathname).toBe('/journal');
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument();
  });
  it('keeps secondary destinations available through More', () => {
    renderPath('/more');
    expect(screen.getByRole('heading', { name: 'More' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'More destinations' })).toBeInTheDocument();
    for (const label of ['Practice', 'Goals', 'Settings', 'Profile']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });
});

/** Every route in the table, with the tab it belongs to and where "up" goes (D218): a new route must be added here. */
const ROUTE_HOMES: Readonly<Record<string, readonly [tab: string | null, parent: string | null]>> = {
  '/': ['/', null], '/journal': ['/journal', null], '/analysis': ['/analysis', null], '/library': ['/library', null], '/more': ['/more', null],
  '/library/words': ['/library', '/library'], '/library/calculators': ['/library', '/library'], '/library/lessons': ['/library', '/library'],
  '/library/lessons/:lessonId': ['/library', '/library/lessons'],
  '/practice': ['/more', '/more'], '/practice/replay': ['/more', '/practice'], '/practice/coach': ['/more', '/practice'], '/practice/patterns': ['/more', '/practice'],
  '/goals': ['/more', '/more'], '/strategies': ['/more', '/more'], '/coach': ['/more', '/more'], '/patterns': ['/more', '/more'],
  '/news-calendar': ['/more', '/more'], '/currency': ['/more', '/more'], '/settings': ['/more', '/more'], '/profile': ['/more', '/more'],
  '/*': [null, '/'],
};

describe('T-053a where am I', () => {
  it('names a tab and a parent for every route in the table', () => {
    const children = (appRoutes[0]!.children ?? []) as readonly { index?: boolean; path?: string }[];
    const paths = children.map(route => (route.index ? '/' : `/${route.path}`));
    expect(paths.slice().sort()).toEqual(Object.keys(ROUTE_HOMES).sort());
    for (const path of paths) {
      const address = path.replace(':lessonId', 'first').replace('*', 'no-such-page');
      const [tab, parent] = ROUTE_HOMES[path]!;
      expect(navigationTabOf(address)?.to ?? null, path).toBe(tab);
      expect(pageParentOf(address)?.to ?? null, path).toBe(parent);
    }
    expect(pageParentOf('/library/lessons/first')).toEqual({ to: '/library/lessons', label: 'Lessons' });
  });

  it('a page opened directly goes up to its parent', async () => {
    renderPath('/goals');
    const back = await screen.findByRole('link', { name: 'Back to More' });
    expect(back).toHaveAttribute('href', '/more');
    expect(back).toHaveTextContent(/^More$/);
  });

  it('a lesson opened directly goes up to Lessons', async () => {
    renderPath('/library/lessons/no-such-lesson');
    expect(await screen.findByRole('link', { name: 'Back to Lessons' })).toHaveAttribute('href', '/library/lessons');
  });

  it('a page opened from the Journal goes back to the Journal', async () => {
    const router = renderPath('/journal');
    await screen.findByRole('heading', { level: 1, name: 'Journal' });
    await act(async () => { await router.navigate('/coach'); });
    const back = await screen.findByRole('button', { name: 'Back to Journal' });
    expect(back).toHaveTextContent(/^Journal$/);
    fireEvent.click(back);
    await screen.findByRole('heading', { level: 1, name: 'Journal' });
    expect(router.state.location.pathname).toBe('/journal');
  });

  it('a tab has no back control', async () => {
    renderPath('/analysis');
    await screen.findByRole('heading', { level: 1, name: 'Analysis' });
    expect(screen.queryByRole('link', { name: /^Back to / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Back to / })).toBeNull();
  });

  it('marks More, and only More, on a page opened from More, and the tab itself on its own page', async () => {
    const { unmount } = render(<RouterProvider router={createMemoryRouter(appRoutes, { initialEntries: ['/goals'] })} />);
    const more = await screen.findByRole('link', { name: 'More' });
    expect(more).toHaveAttribute('aria-current', 'true');
    expect(more).toHaveClass('kairos-shell__nav-link--active');
    for (const label of ['Home', 'Journal', 'Analysis', 'Library']) {
      expect(screen.getByRole('link', { name: label })).not.toHaveAttribute('aria-current');
      expect(screen.getByRole('link', { name: label })).not.toHaveClass('kairos-shell__nav-link--active');
    }
    unmount();
    renderPath('/more');
    expect(await screen.findByRole('link', { name: 'More' })).toHaveAttribute('aria-current', 'page');
  });
});
