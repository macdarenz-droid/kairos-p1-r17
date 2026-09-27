import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../src/app/AppShell';
import { appRoutes } from '../src/app/routes';
import { useToast } from '../src/design-system/primitives';
import { ThemeProvider } from '../src/design-system/themes';
import { axeViolations } from './fixtures/axe';

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => null,
}));

function renderPath(path: string, routes: RouteObject[] = appRoutes) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<ThemeProvider><RouterProvider router={router} /></ThemeProvider>);
  return router;
}

function FocusesItsField() {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  return <><h1>Search</h1><label>Find<input ref={input} /></label></>;
}

function ShowsToast() {
  const { show } = useToast();
  return <><h1>Toasts</h1><button type="button" onClick={() => show({ message: 'Saved.' })}>Save</button></>;
}

const fixtureRoutes: RouteObject[] = [{
  element: <AppShell />,
  children: [
    { path: '/', element: <h1>Start</h1> },
    { path: '/search', element: <FocusesItsField /> },
    { path: '/toasts', element: <ShowsToast /> },
  ],
}];

beforeAll(async () => {
  await Promise.all([import('../src/app/JournalRoute'), import('../src/app/SettingsRoute')]);
}, 30_000);

afterEach(() => { cleanup(); document.title = ''; });

describe('T-049e the accessible shell', () => {
  it('starts with a skip link to main, which can take focus', () => {
    renderPath('/', fixtureRoutes);
    const first = document.querySelector('.kairos-shell a');
    expect(first).toHaveTextContent('Skip to main content');
    expect(first).toHaveAttribute('href', '#kairos-main-content');
    expect(document.getElementById('kairos-main-content')).toHaveAttribute('tabindex', '-1');
  });

  it('titles the first screen from its heading without moving focus', async () => {
    renderPath('/settings');
    await waitFor(() => expect(document.title).toBe('Settings · Kairos'));
    expect(document.activeElement).toBe(document.body);
  });

  it('moves focus to the new heading and retitles the tab after a bottom-bar tap', async () => {
    renderPath('/');
    await screen.findByRole('navigation', { name: 'Primary navigation' });
    fireEvent.click(screen.getByRole('link', { name: 'Journal' }));
    const heading = await screen.findByRole('heading', { level: 1, name: 'Journal' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(document.title).toBe('Journal · Kairos');
  });

  it('never reacts when only the query changes', async () => {
    const router = renderPath('/settings');
    await waitFor(() => expect(document.title).toBe('Settings · Kairos'));
    const home = screen.getByRole('link', { name: 'Home' });
    home.focus();
    document.title = 'unchanged';
    await act(async () => { await router.navigate('/settings?x=1'); });
    expect(document.activeElement).toBe(home);
    expect(document.title).toBe('unchanged');
  });

  it('leaves focus where a screen put it', async () => {
    const router = renderPath('/', fixtureRoutes);
    await waitFor(() => expect(document.title).toBe('Start · Kairos'));
    await act(async () => { await router.navigate('/search'); });
    await waitFor(() => expect(document.title).toBe('Search · Kairos'));
    expect(document.activeElement).toBe(screen.getByLabelText('Find'));
  });

  it('shows no version in the header and a kit icon in each bottom-bar link', () => {
    renderPath('/', fixtureRoutes);
    expect(document.querySelector('.kairos-shell__header')!.textContent).toBe('Kairos');
    for (const label of ['Home', 'Journal', 'Analysis', 'Library', 'More']) {
      const icon = screen.getByRole('link', { name: label }).querySelector('svg');
      expect(icon, label).toHaveAttribute('data-icon');
      expect(icon, label).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('hosts toasts for every screen', () => {
    renderPath('/toasts', fixtureRoutes);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('status')).toHaveTextContent('Saved.');
  });

  it('finds no WCAG problem in the shell', async () => {
    const { container } = render(<ThemeProvider><RouterProvider router={createMemoryRouter(fixtureRoutes, { initialEntries: ['/'] })} /></ThemeProvider>);
    await screen.findByRole('heading', { name: 'Start' });
    expect(await axeViolations(container)).toEqual([]);
  });
});
