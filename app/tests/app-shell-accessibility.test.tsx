import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppShell, SCROLL_CLAIMED_EVENT } from '../src/app/AppShell';
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

describe('T-053a the page opens at the top or at your place', () => {
  const placeRoutes: RouteObject[] = [{
    element: <AppShell />,
    children: [
      { path: '/', element: <h1>Start</h1> },
      { path: '/journal', element: <h1>Tab two</h1> },
      { path: '/long', element: <h1>Long</h1> },
    ],
  }];
  let y = 0;
  const scrolled = (top: number) => { y = top; window.dispatchEvent(new Event('scroll')); };
  function stubScroll() {
    y = 0;
    window.sessionStorage.clear();
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
    return vi.spyOn(window, 'scrollTo').mockImplementation(((_x: number, top: number) => { y = top; }) as typeof window.scrollTo);
  }
  afterEach(() => { vi.restoreAllMocks(); Reflect.deleteProperty(window, 'scrollY'); });

  it('moves focus to the new heading without scrolling', async () => {
    stubScroll();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const router = renderPath('/', placeRoutes);
    await act(async () => { await router.navigate('/long'); });
    await waitFor(() => expect(document.activeElement).toHaveTextContent('Long'));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(focus).not.toHaveBeenCalledWith({ preventScroll: false });
  });

  it('opens a new page at its top, and Back returns to the place you left', async () => {
    const scrollTo = stubScroll();
    const router = renderPath('/', placeRoutes);
    await screen.findByRole('heading', { name: 'Start' });
    scrolled(500);
    await act(async () => { await router.navigate('/long'); });
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
    expect(window.scrollY).toBe(0);
    fireEvent.click(await screen.findByRole('button', { name: 'Back to Start' }));
    await screen.findByRole('heading', { name: 'Start' });
    expect(scrollTo).toHaveBeenLastCalledWith(0, 500);
    expect(window.scrollY).toBe(500);
  });

  it('U15 review r1: a page that brings part of itself into view as it opens stops the shell reaching for its old place', async () => {
    function ClaimsItsView() {
      const notice = useRef<HTMLParagraphElement>(null);
      useEffect(() => { notice.current?.focus(); window.dispatchEvent(new Event(SCROLL_CLAIMED_EVENT)); }, []);
      return <><h1>List</h1><p ref={notice} tabIndex={-1} role="status">Trade deleted.</p></>;
    }
    // Frames run only when the test steps them.
    const frames = new Map<number, FrameRequestCallback>();
    let next = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { next += 1; frames.set(next, callback); return next; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
    const step = () => { const due = [...frames.values()]; frames.clear(); for (const callback of due) callback(performance.now()); };
    const scrollTo = stubScroll();
    const router = renderPath('/', [{ element: <AppShell />, children: [{ path: '/', element: <h1>Start</h1> }, { path: '/journal', element: <ClaimsItsView /> }] }]);
    await screen.findByRole('heading', { name: 'Start' });
    await act(async () => { await router.navigate('/journal'); });
    scrolled(500);
    await act(async () => { await router.navigate('/'); });
    await act(async () => { await router.navigate('/journal'); });
    expect(screen.getByText('Trade deleted.')).toHaveFocus();
    // The notice was brought into view (here: the page at 100); the shell's place (500) no longer pulls it back.
    scrolled(100);
    scrollTo.mockClear();
    step(); step();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(window.scrollY).toBe(100);
    vi.unstubAllGlobals();
  });

  it('keeps each tab\'s place, and the place when only the address\'s query changes', async () => {
    const scrollTo = stubScroll();
    const router = renderPath('/', placeRoutes);
    await screen.findByRole('heading', { name: 'Start' });
    scrolled(400);
    await act(async () => { await router.navigate('/journal'); });
    expect(window.scrollY).toBe(0);
    scrolled(120);
    await act(async () => { await router.navigate('/'); });
    expect(window.scrollY).toBe(400);
    await act(async () => { await router.navigate('/journal'); });
    expect(window.scrollY).toBe(120);
    await act(async () => { await router.navigate('/long'); });
    scrolled(300);
    scrollTo.mockClear();
    await act(async () => { await router.navigate('/long?period=week'); });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(window.scrollY).toBe(300);
  });
});
