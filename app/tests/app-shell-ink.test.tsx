import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, createMemoryRouter } from 'react-router';
import { AppShell } from '../src/app/AppShell';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it, vi } from 'vitest';
import { appRoutes } from '../src/app/routes';
import packageJson from '../package.json' with { type: 'json' };

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => null,
}));

function renderPath(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

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

  it('positions the ink indicator by the active primary destination', () => {
    renderPath('/analysis');
    const inner = screen.getByRole('navigation', { name: 'Primary navigation' }).querySelector('.kairos-shell__navigation-inner') as HTMLElement;
    expect(inner.style.getPropertyValue('--kairos-nav-index')).toBe('2');
    expect(inner.querySelector('.kairos-shell__nav-ink')).toHaveAttribute('aria-hidden', 'true');
  });

  it('treats nested and secondary paths as their primary owner or Home', () => {
    const inner = () => screen.getByRole('navigation', { name: 'Primary navigation' }).querySelector('.kairos-shell__navigation-inner') as HTMLElement;
    renderPath('/settings');
    expect(inner().style.getPropertyValue('--kairos-nav-index')).toBe('0');
  });

  it('shows the mono build identity with a live pulse and an idle route loader', () => {
    renderPath('/');
    expect(screen.getByText(packageJson.version)).toHaveClass('kairos-shell__version');
    expect(document.querySelector('.kairos-shell__pulse')).toHaveAttribute('aria-hidden', 'true');
    const loader = document.querySelector('.kairos-shell__progress');
    expect(loader).toHaveAttribute('role', 'progressbar');
    expect(loader).toHaveAttribute('aria-hidden', 'true');
    expect(document.querySelector('.kairos-shell')).toHaveAttribute('data-loading', 'false');
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
