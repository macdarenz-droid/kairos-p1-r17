import type { IconName } from '../design-system/icons/Icon';

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

/** An item on the More page (D219): its icon and one plain line that says what it is for. */
export interface KairosMoreItem extends KairosNavigationItem {
  readonly icon: IconName;
  readonly line: string;
}

export interface KairosMoreGroup {
  readonly title: string;
  readonly items: readonly KairosMoreItem[];
}

/** The More page in its four groups (D219). Coach and Patterns are Analysis parts (D220), so they are not here. */
export const moreNavigationGroups: readonly KairosMoreGroup[] = Object.freeze([
  { title: 'Your plan', items: [
    { label: 'Goals', to: '/goals', icon: 'goal', line: 'Targets and limits for the month' },
    { label: 'Strategies', to: '/strategies', icon: 'strategy', line: 'Your setups and their rules' },
    { label: 'News calendar', to: '/news-calendar', icon: 'calendar', line: 'Big news this week' },
  ] },
  { title: 'Practice', items: [
    { label: 'Practice', to: '/practice', icon: 'practice', line: 'Trade with pretend money' },
    { label: 'Replay', to: '/practice/replay', icon: 'replay', line: 'Trade past candles, one at a time' },
  ] },
  { title: 'Money', items: [
    { label: 'Currency', to: '/currency', icon: 'currency', line: 'Your home currency and exchange rates' },
    { label: 'Calculators', to: '/library/calculators', icon: 'calculator', line: 'How much can I buy, and what do I risk?' },
  ] },
  { title: 'App', items: [
    { label: 'Settings', to: '/settings', icon: 'settings', line: 'How Kairos looks, and your time zone' },
    { label: 'Profile', to: '/profile', icon: 'profile', line: 'This device, backups and online services' },
    { label: 'Set up Kairos', to: '/setup', icon: 'setup', line: 'Your setup, step by step' },
  ] },
] satisfies readonly KairosMoreGroup[]);

/** Every More item, in the page's order. */
export const moreNavigation: readonly KairosMoreItem[] = Object.freeze(moreNavigationGroups.flatMap((group) => group.items));

/** Pages that belong to a tab without sitting under its address (D220): the tab, and the part of it "up" opens. */
const PAGES_FILED_UNDER: Readonly<Record<string, Readonly<{ tab: string; parent: string }>>> = Object.freeze({
  '/coach': { tab: '/analysis', parent: '/analysis?view=discipline' },
  '/patterns': { tab: '/analysis', parent: '/analysis?view=patterns' },
});

/** A page's address without a trailing slash ("/more/" is the More page). */
export function normalizePathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname;
}

const isAtOrUnder = (pathname: string, item: KairosNavigationItem) =>
  item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);

export type KairosNavigationTab = (typeof primaryNavigation)[number];

/**
 * The bottom-bar tab a page belongs to (D218, D219): a tab's own page and the pages under it name that tab; Coach
 * and Patterns name Analysis (D220); a page listed under More, or under such a page, names More; a page with no home
 * (not found) gives null.
 */
export function navigationTabOf(address: string): KairosNavigationTab | null {
  const pathname = normalizePathname(address);
  const tab = primaryNavigation.find((item) => isAtOrUnder(pathname, item));
  if (tab !== undefined) return tab;
  const filed = Object.entries(PAGES_FILED_UNDER).find(([page]) => pathname === page || pathname.startsWith(`${page}/`));
  if (filed !== undefined) return primaryNavigation.find((item) => item.to === filed[1].tab) ?? null;
  if (moreNavigation.some((item) => isAtOrUnder(pathname, item))) return primaryNavigation.find((item) => item.to === '/more') ?? null;
  return null;
}

/** Whether the page is one of the bottom-bar tabs itself (not a page under one). */
export function isNavigationTabPage(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return primaryNavigation.some((item) => item.to === path);
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
  '/analysis': 'Analysis',
});

/**
 * Where "up" goes from a page that isn't a tab (D218): the nearest page above it in its address; Coach and Patterns
 * go to their Analysis part; a page listed under More goes to More; any other page goes Home. Null for a tab.
 */
export function pageParentOf(pathname: string): KairosPageParent | null {
  const path = normalizePathname(pathname);
  if (isNavigationTabPage(path)) return null;
  const segments = path.split('/').filter((segment) => segment !== '');
  for (let length = segments.length - 1; length >= 1; length -= 1) {
    const candidate = `/${segments.slice(0, length).join('/')}`;
    const label = PARENT_PAGES[candidate];
    if (label !== undefined) return Object.freeze({ to: candidate, label });
  }
  const filed = PAGES_FILED_UNDER[path];
  if (filed !== undefined) return Object.freeze({ to: filed.parent, label: PARENT_PAGES[filed.tab]! });
  if (moreNavigation.some((item) => item.to === path)) return Object.freeze({ to: '/more', label: PARENT_PAGES['/more']! });
  return Object.freeze({ to: '/', label: PARENT_PAGES['/']! });
}
