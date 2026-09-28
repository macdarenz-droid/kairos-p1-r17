import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouteError } from '../src/app/RouteError';
import { RouterProvider } from 'react-router/dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { appRoutes } from '../src/app/routes';
import { ThemeProvider } from '../src/design-system/themes';

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => null,
}));

function renderPath(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  return render(<ThemeProvider><RouterProvider router={router} /></ThemeProvider>);
}

// Lazy screens render one tick later; load their modules once so the first dynamic import under full-suite load fits findByRole's timeout.
beforeAll(async () => {
  await Promise.all([
    import('../src/app/JournalRoute'),
    import('../src/app/AnalysisRoute'),
    import('../src/app/LibraryRoute'),
    import('../src/app/PracticeRoute'),
    import('../src/app/GoalsRoute'),
    import('../src/app/SettingsRoute'),
    import('../src/app/ProfileRoute'),
  ]);
}, 30_000);

describe('P1 routing shell', () => {
  const routeCases = [
    ['/', 'Home'],
    ['/journal', 'Journal'],
    ['/analysis', 'Analysis'],
    ['/library', 'Library'],
    ['/more', 'More'],
    ['/practice', 'Practice'],
    ['/goals', 'Goals'],
    ['/settings', 'Settings'],
    ['/profile', 'Profile'],
  ] as const;

  it.each(routeCases)('renders the production route %s as %s', async (path, heading) => {
    renderPath(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('shows "Loading…" while a screen opened first is still loading', async () => {
    renderPath('/goals');
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(await screen.findByRole('heading', { name: 'Goals' })).toBeInTheDocument();
  });

  it('offers a reload when a screen cannot load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const router = createMemoryRouter([
      { path: '/', ErrorBoundary: RouteError, children: [{ index: true, lazy: async () => { throw new Error('chunk missing'); } }] },
    ], { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('heading', { name: 'Page unavailable' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('renders the production not-found route for an unknown path', () => {
    renderPath('/does-not-exist');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
