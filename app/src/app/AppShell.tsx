import { Link, Outlet, useLocation, useNavigate, useNavigation, useNavigationType, type Location } from 'react-router';
import { TradePictureCandleLoaderContext } from '../features/journal/tradePictureCandleQueue';
import { browserTradePictureCandleLoader } from './tradePictureCandleBrowserDeps';
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { Icon, type IconName } from '../design-system/icons/Icon';
import { ToastProvider } from '../design-system/primitives';
import { isNavigationTabPage, navigationTabOf, pageParentOf, primaryNavigation } from './navigation';
import { backStepOf, EMPTY_BACK_TRAIL, recordBackTrailNavigation, recordBackTrailTitle, type BackTrail } from './backTrail';
import { UpdatePrompt, type UpdatePromptPort } from '../features/shell/UpdatePrompt';
import { activateWaitingServiceWorker, subscribeServiceWorkerStatus } from '../pwa/serviceWorkerRegistration';

const updatePromptPort: UpdatePromptPort = Object.freeze({ subscribe: subscribeServiceWorkerStatus, activate: activateWaitingServiceWorker });

/** The kit's icon for each bottom-bar destination; the label remains the accessible name. */
const navigationIcons: Readonly<Record<string, IconName>> = Object.freeze({
  '/': 'home', '/journal': 'journal', '/analysis': 'analysis', '/library': 'library', '/more': 'more',
});

const MAIN_ID = 'kairos-main-content';

/**
 * D179: after each change of path (never of only the query or hash), the tab title becomes "{screen h1} · Kairos", and
 * focus moves to that h1 unless this is the first screen or the screen already put focus inside main. A screen whose
 * h1 arrives later (lazy code, data) is handled when the h1 appears. The focus never scrolls: the page's place is the
 * scroll keeper's (D218). `onTitle` hears each screen's title.
 */
function useScreenTitleAndFocus(pathname: string, onTitle: (title: string) => void): void {
  const firstPath = useRef<string | null>(null);
  const navigated = useRef(false);
  useEffect(() => {
    // Safe to run twice for one path (React's StrictMode does): the title is set again and focus is already in main.
    if (firstPath.current === null) firstPath.current = pathname;
    else if (pathname !== firstPath.current) navigated.current = true;
    const firstScreen = !navigated.current;
    const main = document.getElementById(MAIN_ID);
    if (main === null) return;
    const settle = (): boolean => {
      const heading = main.querySelector('h1');
      if (heading === null) return false;
      const text = heading.textContent?.trim() ?? '';
      document.title = text === '' ? 'Kairos' : `${text} · Kairos`;
      onTitle(text);
      if (!firstScreen && !main.contains(document.activeElement)) {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
      return true;
    };
    if (settle()) return;
    document.title = 'Kairos';
    const observer = new MutationObserver(() => { if (settle()) observer.disconnect(); });
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
    // onTitle is read when the title settles; a new function each render must not re-run the move.
  }, [pathname]);
}

const SCROLL_PLACES_KEY = 'kairos.scroll-places.v1';
/** Places kept across a reload (sessionStorage, this tab only); the newest are kept. */
const SCROLL_PLACES_KEPT = 50;
/** How long a returning page keeps reaching for its place while its data arrives. */
const SCROLL_PLACE_PATIENCE_MS = 1000;

function readScrollPlaces(): Map<string, number> {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(SCROLL_PLACES_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return new Map();
    return new Map(parsed.filter((pair): pair is [string, number] => Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'number' && Number.isFinite(pair[1])));
  } catch {
    return new Map();
  }
}

function keepScrollPlaces(places: ReadonlyMap<string, number>): void {
  try {
    window.sessionStorage.setItem(SCROLL_PLACES_KEY, JSON.stringify([...places].slice(-SCROLL_PLACES_KEPT)));
  } catch {
    // A full or blocked storage only loses the places after a reload.
  }
}

/**
 * D218: a page opened by a link starts at its top; a page returned to by Back (the shell's or the phone's) goes back
 * to where it was left, and each tab keeps its own place. A changed query on the same page keeps the place. A page
 * whose data arrives late is shorter than its place at first, so the place is reached for until it is reached and
 * the page is tall enough, the trader scrolls or touches, or a second passes.
 */
function useScrollPlaces(location: Location): void {
  const places = useRef<Map<string, number> | null>(null);
  places.current ??= readScrollPlaces();
  const current = useRef<string | null>(null);
  const shownPath = useRef<string | null>(null);
  useEffect(() => {
    const kept = places.current!;
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    const remember = () => { if (current.current !== null) kept.set(current.current, window.scrollY); };
    const leave = () => keepScrollPlaces(kept);
    window.addEventListener('scroll', remember, { passive: true });
    window.addEventListener('pagehide', leave);
    return () => { window.removeEventListener('scroll', remember); window.removeEventListener('pagehide', leave); };
  }, []);
  useLayoutEffect(() => {
    // A first screen's history key is always "default", so an entry is named by its key and its page together.
    const key = isNavigationTabPage(location.pathname) ? `tab:${location.pathname}` : `entry:${location.key}:${location.pathname}`;
    const samePage = shownPath.current === location.pathname;
    current.current = key;
    shownPath.current = location.pathname;
    if (samePage) { places.current!.set(key, window.scrollY); return; }
    const place = places.current!.get(key) ?? 0;
    if (place !== window.scrollY) window.scrollTo(0, place);
    if (place <= 0 || typeof requestAnimationFrame !== 'function') return;
    let frame = 0;
    const until = performance.now() + SCROLL_PLACE_PATIENCE_MS;
    const stopEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    const stop = () => {
      cancelAnimationFrame(frame);
      for (const name of stopEvents) window.removeEventListener(name, stop);
    };
    const reach = () => {
      if (performance.now() > until) { stop(); return; }
      if (Math.abs(window.scrollY - place) > 1) window.scrollTo(0, place);
      frame = requestAnimationFrame(reach);
    };
    for (const name of stopEvents) window.addEventListener(name, stop, { passive: true });
    frame = requestAnimationFrame(reach);
    return stop;
  }, [location.key, location.pathname]);
}

/** D218: the back control's trail for this visit; it is kept in a ref and moved on once per shown entry. */
function useBackTrail(location: Location) {
  const navigationType = useNavigationType();
  const trail = useRef<BackTrail>(EMPTY_BACK_TRAIL);
  const shownKey = useRef<string | null>(null);
  if (shownKey.current !== location.key) {
    trail.current = recordBackTrailNavigation(trail.current, { kind: navigationType, key: location.key, pathname: location.pathname, fromKey: shownKey.current });
    shownKey.current = location.key;
  }
  const key = location.key;
  return {
    step: backStepOf(trail.current, key, pageParentOf(location.pathname)),
    onTitle: (title: string) => { trail.current = recordBackTrailTitle(trail.current, key, title); },
  };
}

/** The back control above a page that isn't a tab: back to where you came from, or up to the page's parent. */
function BackControl({ step }: { readonly step: NonNullable<ReturnType<typeof backStepOf>> }) {
  const navigate = useNavigate();
  const content = <><Icon name="chevron-down" size={16} className="kairos-shell__back-icon" />{step.label}</>;
  return <div className="kairos-shell__back-row">
    {step.kind === 'up'
      ? <Link className="kairos-shell__back" to={step.to} aria-label={`Back to ${step.label}`}>{content}</Link>
      : <button type="button" className="kairos-shell__back" aria-label={`Back to ${step.label}`} onClick={() => { void navigate(-step.steps); }}>{content}</button>}
  </div>;
}

/** Production data-router wrapper: the only place router loading state is read. */
export function AppShellRoute() {
  const navigation = useNavigation();
  return <AppShell loading={navigation.state !== 'idle'} />;
}

/** Presentation shell. Works inside any router; loading is supplied by the owner above. */
export function AppShell({ loading = false }: { readonly loading?: boolean }) {
  const location = useLocation();
  const tab = navigationTabOf(location.pathname);
  const navIndex = tab === null ? null : primaryNavigation.indexOf(tab);
  const inkStyle = (navIndex === null ? {} : { '--kairos-nav-index': navIndex }) as CSSProperties;
  const back = useBackTrail(location);
  useScreenTitleAndFocus(location.pathname, back.onTitle);
  useScrollPlaces(location);
  return (
    <div className="kairos-shell" data-app="kairos" data-loading={loading ? 'true' : 'false'}>
      <a className="kairos-skip-link" href={`#${MAIN_ID}`}>Skip to main content</a>
      <header className="kairos-shell__header">
        <div className="kairos-shell__header-inner">
          <strong className="kairos-shell__brand">Kairos</strong>
        </div>
        <div className="kairos-shell__progress" role="progressbar" aria-label="Loading" aria-hidden={loading ? undefined : 'true'} />
      </header>
      <UpdatePrompt port={updatePromptPort} />
      <ToastProvider>
        <main className="kairos-shell__content" id={MAIN_ID} tabIndex={-1}>
          {back.step === null ? null : <BackControl step={back.step} />}
          <TradePictureCandleLoaderContext.Provider value={browserTradePictureCandleLoader()}><Outlet /></TradePictureCandleLoaderContext.Provider>
        </main>
      </ToastProvider>
      <nav className="kairos-shell__navigation" aria-label="Primary navigation">
        <div className="kairos-shell__navigation-inner" style={inkStyle}>
          {navIndex === null ? null : <span className="kairos-shell__nav-ink" aria-hidden="true" />}
          {primaryNavigation.map((item) => (
            // D219: the tab a page belongs to is marked: "page" on the tab's own page, "true" on a page under it.
            <Link
              key={item.to}
              to={item.to}
              className={`kairos-shell__nav-link${item === tab ? ' kairos-shell__nav-link--active' : ''}`}
              aria-current={item === tab ? (location.pathname === item.to ? 'page' : 'true') : undefined}
            >
              <Icon name={navigationIcons[item.to] ?? 'more'} size={20} className="kairos-shell__nav-icon" />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
