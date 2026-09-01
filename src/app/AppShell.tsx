import { NavLink, Outlet } from 'react-router';
import { buildInfo } from './buildInfo';
import { primaryNavigation } from './navigation';

export function AppShell() {
  return (
    <div className="kairos-shell" data-app="kairos">
      <header className="kairos-shell__header">
        <div className="kairos-shell__header-inner">
          <strong className="kairos-shell__brand">Kairos</strong>
          <small className="kairos-shell__version">{buildInfo.appVersion}</small>
        </div>
      </header>
      <main className="kairos-shell__content" id="kairos-main-content">
        <Outlet />
      </main>
      <nav className="kairos-shell__navigation" aria-label="Primary navigation">
        <div className="kairos-shell__navigation-inner">
          {primaryNavigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `kairos-shell__nav-link${isActive ? ' kairos-shell__nav-link--active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
