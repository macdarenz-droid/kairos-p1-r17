import type { KairosPageParent } from './navigation';

/** How the app arrived at a history entry, as React Router reports it (`useNavigationType`). */
export type BackTrailNavigation = 'PUSH' | 'REPLACE' | 'POP';

interface BackTrailEntry {
  /** The entry this one was opened from: always the entry just before it in the history. */
  readonly origin: string | null;
  readonly pathname: string;
  readonly title: string | null;
}

/**
 * What the shell remembers in this visit (memory only, D218): for each history entry (by React Router's location key),
 * the entry it was opened from, its page and the title it showed. A reload starts with an empty trail.
 */
export type BackTrail = ReadonlyMap<string, BackTrailEntry>;

export const EMPTY_BACK_TRAIL: BackTrail = new Map();

/**
 * The trail after the app shows the entry `key` (at `pathname`), arriving from the entry `fromKey` (null on the first
 * screen). A push remembers where it came from; a replace takes over the replaced entry's origin (that entry is gone
 * from the history); a pop returns to an entry, whose origin is already remembered or, from before a reload, unknown.
 */
export function recordBackTrailNavigation(trail: BackTrail, navigation: Readonly<{ kind: BackTrailNavigation; key: string; pathname: string; fromKey: string | null }>): BackTrail {
  const { kind, key, pathname, fromKey } = navigation;
  const known = trail.get(key);
  if (known !== undefined && known.pathname === pathname && (kind === 'POP' || key === fromKey)) return trail;
  const origin = kind === 'POP' || fromKey === null || key === fromKey ? known?.origin ?? null
    : kind === 'PUSH' ? fromKey : trail.get(fromKey)?.origin ?? null;
  // The same page under a new address (a changed period, a step) shows the same title until its h1 says otherwise.
  const from = fromKey === null ? undefined : trail.get(fromKey);
  const title = known?.pathname === pathname ? known.title : from?.pathname === pathname ? from.title : null;
  return new Map(trail).set(key, Object.freeze({ origin, pathname, title }));
}

/** The trail once the entry `key` shows its title (the page's h1). */
export function recordBackTrailTitle(trail: BackTrail, key: string, title: string): BackTrail {
  const entry = trail.get(key);
  if (entry === undefined || title === '' || entry.title === title) return trail;
  return new Map(trail).set(key, Object.freeze({ ...entry, title }));
}

/** Where the back control goes: `steps` entries back in the history, to the page it was opened from, or up to its parent. */
export type BackStep =
  | Readonly<{ kind: 'back'; steps: number; label: string }>
  | Readonly<{ kind: 'up'; to: string; label: string }>;

/**
 * The back control for the entry `key` on a page whose parent is `parent` (null for a tab: no control). Back to the
 * last other page it was opened from in this visit, named by that page's title (entries of the same page, such as a
 * changed period, are passed over); else up to the parent, named by the parent's title.
 */
export function backStepOf(trail: BackTrail, key: string, parent: KairosPageParent | null): BackStep | null {
  if (parent === null) return null;
  const here = trail.get(key);
  let origin = here?.origin ?? null;
  let steps = 1;
  while (origin !== null && here !== undefined && steps <= trail.size) {
    const entry = trail.get(origin);
    if (entry === undefined) break;
    if (entry.pathname !== here.pathname) {
      if (entry.title !== null) return Object.freeze({ kind: 'back', steps, label: entry.title });
      break;
    }
    origin = entry.origin;
    steps += 1;
  }
  return Object.freeze({ kind: 'up', to: parent.to, label: parent.label });
}
