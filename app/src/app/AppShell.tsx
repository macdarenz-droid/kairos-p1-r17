import { NavLink, Outlet, useLocation, useNavigation } from 'react-router';
import type { CSSProperties, ReactElement } from 'react';
import { buildInfo } from './buildInfo';
import { primaryNavigation } from './navigation';

/** Hand-drawn 1.6px line icons; the label remains the accessible name. */
const navigationIcons: Readonly<Record<string, ReactElement>> = Object.freeze({
  '/': <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z" />,
  '/journal': <><path d="M6 4h10l3 3v13H6z" /><path d="M9 11h6M9 15h6" /></>,
  '/analysis': <><path d="M4 18 10 11l4 4 6-8" /><path d="M4 21h16" /></>,
  '/library': <path d="M5 4h4v16H5zM11 4h4v16h-4zM17 6l3 1-3 13-3-1z" />,
  '/more': <><circle cx="6" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18" cy="12" r="1.2" /></>,
});

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
  return (
    <div className="kairos-shell" data-app="kairos" data-loading={loading ? 'true' : 'false'}>
      <header className="kairos-shell__header">
        <div className="kairos-shell__header-inner">
          <strong className="kairos-shell__brand">Kairos</strong>
          <small className="kairos-shell__version"><span className="kairos-shell__pulse" aria-hidden="true" />{buildInfo.appVersion}</small>
        </div>
        <div className="kairos-shell__progress" role="progressbar" aria-label="Loading" aria-hidden={loading ? undefined : 'true'} />
      </header>
      <main className="kairos-shell__content" id="kairos-main-content">
        <Outlet />
      </main>
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
              <svg className="kairos-shell__nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{navigationIcons[item.to]}</svg>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
