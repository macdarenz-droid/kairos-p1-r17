export interface KairosNavigationItem {
  readonly label: string;
  readonly to: string;
  readonly end?: boolean;
}

export const primaryNavigation = Object.freeze([
  { label: 'Home', to: '/', end: true },
  { label: 'Journal', to: '/journal' },
  { label: 'Analysis', to: '/analysis' },
  { label: 'Library', to: '/library' },
  { label: 'More', to: '/more' },
] satisfies readonly KairosNavigationItem[]);

export const moreNavigation = Object.freeze([
  { label: 'Practice', to: '/practice' },
  { label: 'Goals', to: '/goals' },
  { label: 'Strategies', to: '/strategies' },
  { label: 'Coach', to: '/coach' },
  { label: 'Patterns', to: '/patterns' },
  { label: 'News calendar', to: '/news-calendar' },
  { label: 'Currency', to: '/currency' },
  { label: 'Settings', to: '/settings' },
  { label: 'Profile', to: '/profile' },
] satisfies readonly KairosNavigationItem[]);

const isAtOrUnder = (pathname: string, item: KairosNavigationItem) =>
  item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);

export type KairosNavigationTab = (typeof primaryNavigation)[number];

/**
 * The bottom-bar tab a page belongs to (D218, D219): a tab's own page and the pages under it name that tab; a page
 * listed under More, or under such a page, names More; a page with no home (not found) gives null.
 */
export function navigationTabOf(pathname: string): KairosNavigationTab | null {
  const tab = primaryNavigation.find((item) => isAtOrUnder(pathname, item));
  if (tab !== undefined) return tab;
  if (moreNavigation.some((item) => isAtOrUnder(pathname, item))) return primaryNavigation.find((item) => item.to === '/more') ?? null;
  return null;
}

/** Whether the page is one of the bottom-bar tabs itself (not a page under one). */
export function isNavigationTabPage(pathname: string): boolean {
  return primaryNavigation.some((item) => item.to === pathname);
}

export interface KairosPageParent {
  readonly to: string;
  /** The parent page's own title (its h1). */
  readonly label: string;
}

/** Pages that other pages sit under, with the title each shows. */
const PARENT_PAGES: Readonly<Record<string, string>> = Object.freeze({
  '/': 'Home',
  '/library': 'Library',
  '/library/lessons': 'Lessons',
  '/practice': 'Practice',
  '/more': 'More',
});

/**
 * Where "up" goes from a page that isn't a tab (D218): the nearest page above it in its address; a page listed under
 * More goes to More; any other page goes Home. Null for a tab.
 */
export function pageParentOf(pathname: string): KairosPageParent | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (isNavigationTabPage(path)) return null;
  const segments = path.split('/').filter((segment) => segment !== '');
  for (let length = segments.length - 1; length >= 1; length -= 1) {
    const candidate = `/${segments.slice(0, length).join('/')}`;
    const label = PARENT_PAGES[candidate];
    if (label !== undefined) return Object.freeze({ to: candidate, label });
  }
  if (moreNavigation.some((item) => item.to === path)) return Object.freeze({ to: '/more', label: PARENT_PAGES['/more']! });
  return Object.freeze({ to: '/', label: PARENT_PAGES['/']! });
}
