import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, createMemoryRouter } from 'react-router';
import { AppShell } from '../src/app/AppShell';
import { RouterProvider } from 'react-router/dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { appRoutes } from '../src/app/routes';
import { ThemeProvider } from '../src/design-system/themes';
import packageJson from '../package.json' with { type: 'json' };

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => null,
}));

function renderPath(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(<ThemeProvider><RouterProvider router={router} /></ThemeProvider>);
  return router;
}

beforeAll(async () => {
  await Promise.all([import('../src/app/AnalysisRoute'), import('../src/app/SettingsRoute')]);
}, 30_000);

describe('Ink app shell presentation', () => {
  it('keeps the five labelled destinations and adds one hidden icon per link', () => {
    renderPath('/');
    const links = ['Home', 'Journal', 'Analysis', 'Library', 'More'].map((label) => screen.getByRole('link', { name: label }));
    for (const link of links) {
      const icon = link.querySelector('svg.kairos-shell__nav-icon');
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('positions the ink indicator by the active primary destination', async () => {
    renderPath('/analysis');
    const inner = (await screen.findByRole('navigation', { name: 'Primary navigation' })).querySelector('.kairos-shell__navigation-inner') as HTMLElement;
    expect(inner.style.getPropertyValue('--kairos-nav-index')).toBe('2');
    expect(inner.querySelector('.kairos-shell__nav-ink')).toHaveAttribute('aria-hidden', 'true');
  });

  it('treats nested and secondary paths as their primary owner, More, or no marker', async () => {
    const inner = () => screen.getByRole('navigation', { name: 'Primary navigation' }).querySelector('.kairos-shell__navigation-inner') as HTMLElement;
    for (const [path, index] of [['/settings', '4'], ['/strategies/anything', '4'], ['/library/anything', '3']] as const) {
      const { unmount } = render(<ThemeProvider><RouterProvider router={createMemoryRouter(appRoutes, { initialEntries: [path] })} /></ThemeProvider>);
      await screen.findByRole('navigation', { name: 'Primary navigation' });
      expect(inner().style.getPropertyValue('--kairos-nav-index'), path).toBe(index);
      expect(inner().querySelector('.kairos-shell__nav-ink'), path).not.toBeNull();
      unmount();
    }
    renderPath('/no-such-screen');
    await screen.findByRole('navigation', { name: 'Primary navigation' });
    expect(inner().querySelector('.kairos-shell__nav-ink')).toBeNull();
    expect(inner().style.getPropertyValue('--kairos-nav-index')).toBe('');
  });

  it('shows no version in the header, and an idle route loader', async () => {
    renderPath('/');
    expect(document.querySelector('.kairos-shell__header')).not.toHaveTextContent(packageJson.version);
    const loader = document.querySelector('.kairos-shell__progress');
    expect(loader).toHaveAttribute('role', 'progressbar');
    expect(loader).toHaveAttribute('aria-hidden', 'true');
    expect(document.querySelector('.kairos-shell')).toHaveAttribute('data-loading', 'false');
  });

  it('shows the version on Profile instead', async () => {
    renderPath('/profile');
    expect(await screen.findByText(new RegExp(`Kairos ${packageJson.version.replaceAll('.', '\\.')} · build`), undefined, { timeout: 10_000 })).toBeInTheDocument();
  });

  it('renders inside a plain MemoryRouter without data-router state, as the browser fixtures do', () => {
    render(<MemoryRouter><Routes><Route element={<AppShell />}><Route path="/" element={<h1>Fixture</h1>} /></Route></Routes></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Fixture' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument();
    expect(document.querySelector('.kairos-shell')).toHaveAttribute('data-loading', 'false');
    render(<MemoryRouter><Routes><Route element={<AppShell loading />}><Route path="/" element={<p>Loading fixture</p>} /></Route></Routes></MemoryRouter>);
    expect(document.querySelectorAll('.kairos-shell[data-loading="true"]')).toHaveLength(1);
  });
});
