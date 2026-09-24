import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it, vi } from 'vitest';
import { appRoutes } from '../src/app/routes';
import { ThemeProvider } from '../src/design-system/themes';

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => null,
}));

function renderPath(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  return render(<ThemeProvider><RouterProvider router={router} /></ThemeProvider>);
}

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

  it.each(routeCases)('renders the production route %s as %s', (path, heading) => {
    renderPath(path);
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('renders the production not-found route for an unknown path', () => {
    renderPath('/does-not-exist');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
