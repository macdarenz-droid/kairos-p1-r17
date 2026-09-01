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
  { label: 'Settings', to: '/settings' },
  { label: 'Profile', to: '/profile' },
] satisfies readonly KairosNavigationItem[]);
