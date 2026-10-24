import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { moreNavigation, navigationTabOf, pageParentOf } from '../src/app/navigation';
import { appRoutes } from '../src/app/routes';
import { readLessonCatalog } from '../src/application/learn/lessons';

function renderPath(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeAll(async () => {
  // Every screen these tests open, loaded once, so a lazy screen never outlasts a find (T-053a fix r1).
  await Promise.all([
    import('../src/app/AnalysisRoute'), import('../src/app/JournalRoute'), import('../src/app/GoalsRoute'), import('../src/app/LibraryRoute'),
    import('../src/features/discipline/CoachScreen'), import('../src/features/learn/LessonListScreen'), import('../src/features/learn/LessonReaderScreen'),
  ]);
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
  '/': ['/', null], '/journal': ['/journal', null], '/journal/log': ['/journal', '/journal'], '/journal/trades/:id': ['/journal', '/journal'], '/analysis': ['/analysis', null], '/library': ['/library', null], '/more': ['/more', null],
  '/library/words': ['/library', '/library'], '/library/calculators': ['/library', '/library'], '/library/lessons': ['/library', '/library'],
  '/library/lessons/:lessonId': ['/library', '/library/lessons'],
  '/practice': ['/more', '/more'], '/practice/replay': ['/more', '/practice'], '/practice/coach': ['/more', '/practice'], '/practice/patterns': ['/more', '/practice'], '/practice/trades/:id': ['/more', '/practice'],
  '/goals': ['/more', '/more'], '/strategies': ['/more', '/more'], '/coach': ['/analysis', '/analysis?view=discipline'], '/patterns': ['/analysis', '/analysis?view=patterns'],
  '/news-calendar': ['/more', '/more'], '/currency': ['/more', '/more'], '/settings': ['/more', '/more'], '/profile': ['/more', '/more'],
  '/setup': ['/more', '/more'], '/backup': ['/more', '/more'],
  '/*': [null, '/'],
};

describe('T-053a where am I', () => {
  it('names a tab and a parent for every route in the table', () => {
    const children = (appRoutes[0]!.children ?? []) as readonly { index?: boolean; path?: string }[];
    const paths = children.map(route => (route.index ? '/' : `/${route.path}`));
    expect(paths.slice().sort()).toEqual(Object.keys(ROUTE_HOMES).sort());
    for (const path of paths) {
      const address = path.replace(':lessonId', 'first').replace(':id', 'first').replace('*', 'no-such-page');
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

  it('T-053a fix r1: after the back control, focus is on the new page\'s heading, even where that page has its own back control', async () => {
    const lesson = readLessonCatalog().lessons[0]!;
    const router = renderPath('/library');
    await screen.findByRole('heading', { level: 1, name: 'Library' });
    await act(async () => { await router.navigate('/library/lessons'); });
    await screen.findByRole('heading', { level: 1, name: 'Lessons' });
    await act(async () => { await router.navigate(`/library/lessons/${lesson.id}`); });
    await screen.findByRole('heading', { level: 1, name: lesson.title });
    const back = screen.getByRole('button', { name: 'Back to Lessons' });
    back.focus();
    fireEvent.click(back);
    const lessons = await screen.findByRole('heading', { level: 1, name: 'Lessons' });
    await waitFor(() => expect(lessons).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Back to Library' })).not.toHaveFocus();
  });

  it('T-053a fix r2: another entry of the same page keeps the back control, and its focus', async () => {
    const router = renderPath('/library/lessons');
    const back = await screen.findByRole('link', { name: 'Back to Library' });
    back.focus();
    await act(async () => { await router.navigate('/library/lessons?from=list'); });
    expect(router.state.location.search).toBe('?from=list');
    expect(screen.getByRole('link', { name: 'Back to Library' })).toBe(back);
    expect(back).toHaveFocus();
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

describe('T-053b More in four groups', () => {
  const GROUPS = [
    ['Your plan', [['Goals', '/goals', 'Targets and limits for the month', 'goal'], ['Strategies', '/strategies', 'Your setups and their rules', 'strategy'], ['News calendar', '/news-calendar', 'Big news this week', 'calendar']]],
    ['Practice', [['Practice', '/practice', 'Trade with pretend money', 'practice'], ['Replay', '/practice/replay', 'Trade past candles, one at a time', 'replay']]],
    ['Money', [['Currency', '/currency', 'Your home currency and exchange rates', 'currency'], ['Calculators', '/library/calculators', 'How much can I buy, and what do I risk?', 'calculator']]],
    ['App', [['Settings', '/settings', 'How Kairos looks, and your time zone', 'settings'], ['Backup and restore', '/backup', 'Save a copy, or bring one back', 'backup'], ['Profile', '/profile', 'This device and online services', 'profile'], ['Set up Kairos', '/setup', 'Your setup, step by step', 'setup']]],
  ] as const;

  it('shows each group under its heading, each item with its icon, its name and its line', () => {
    renderPath('/more');
    const nav = screen.getByRole('navigation', { name: 'More destinations' });
    expect(Array.from(nav.querySelectorAll('h2')).map(heading => heading.textContent)).toEqual(GROUPS.map(([title]) => title));
    for (const [title, items] of GROUPS) {
      const group = screen.getByRole('region', { name: title });
      const links = Array.from(group.querySelectorAll('a'));
      expect(links.map(link => link.getAttribute('href'))).toEqual(items.map(([, to]) => to));
      for (const [label, to, line, icon] of items) {
        const link = screen.getByRole('link', { name: label });
        expect(link).toHaveAttribute('href', to);
        expect(link).toHaveAccessibleDescription(line);
        expect(link.querySelector('svg')).toHaveAttribute('data-icon', icon);
        expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      }
    }
  });

  it('no longer lists Coach and Patterns, which belong to Analysis', () => {
    renderPath('/more');
    expect(screen.queryByRole('link', { name: 'Coach' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Patterns' })).toBeNull();
    expect(navigationTabOf('/coach')?.to).toBe('/analysis');
    expect(pageParentOf('/patterns')).toEqual({ to: '/analysis?view=patterns', label: 'Analysis' });
  });

  it('opens a route for every item', () => {
    const children = (appRoutes[0]!.children ?? []) as readonly { index?: boolean; path?: string }[];
    const paths = new Set(children.map(route => (route.index ? '/' : `/${route.path}`)));
    for (const item of moreNavigation) expect(paths.has(item.to), item.to).toBe(true);
  });
});
