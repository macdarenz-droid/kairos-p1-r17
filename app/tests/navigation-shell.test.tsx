import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { beforeAll, describe, expect, it } from 'vitest';
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
