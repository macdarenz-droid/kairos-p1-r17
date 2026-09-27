import { NavLink, Outlet, useLocation, useNavigation } from 'react-router';
import { TradePictureCandleLoaderContext } from '../features/journal/tradePictureCandleQueue';
import { browserTradePictureCandleLoader } from './tradePictureCandleBrowserDeps';
import { useEffect, useRef, type CSSProperties } from 'react';
import { Icon, type IconName } from '../design-system/icons/Icon';
import { ToastProvider } from '../design-system/primitives';
import { primaryNavigation } from './navigation';
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
 * h1 arrives later (lazy code, data) is handled when the h1 appears.
 */
function useScreenTitleAndFocus(pathname: string): void {
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
      if (!firstScreen && !main.contains(document.activeElement)) {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: false });
      }
      return true;
    };
    if (settle()) return;
    document.title = 'Kairos';
    const observer = new MutationObserver(() => { if (settle()) observer.disconnect(); });
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);
}

function activeNavigationIndex(pathname: string): number {
  const index = primaryNavigation.findIndex((item) =>
    item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
  return index < 0 ? 0 : index;
}

/** Production data-router wrapper: the only place router loading state is read. */
export function AppShellRoute() {
  const navigation = useNavigation();
  return <AppShell loading={navigation.state !== 'idle'} />;
}

/** Presentation shell. Works inside any router; loading is supplied by the owner above. */
export function AppShell({ loading = false }: { readonly loading?: boolean }) {
  const location = useLocation();
  const inkStyle = { '--kairos-nav-index': activeNavigationIndex(location.pathname) } as CSSProperties;
  useScreenTitleAndFocus(location.pathname);
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
          <TradePictureCandleLoaderContext.Provider value={browserTradePictureCandleLoader()}><Outlet /></TradePictureCandleLoaderContext.Provider>
        </main>
      </ToastProvider>
      <nav className="kairos-shell__navigation" aria-label="Primary navigation">
        <div className="kairos-shell__navigation-inner" style={inkStyle}>
          <span className="kairos-shell__nav-ink" aria-hidden="true" />
          {primaryNavigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `kairos-shell__nav-link${isActive ? ' kairos-shell__nav-link--active' : ''}`
              }
            >
              <Icon name={navigationIcons[item.to] ?? 'more'} size={24} className="kairos-shell__nav-icon" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
