import type { KairosPageParent } from './navigation';

/** How the app arrived at a history entry, as React Router reports it (`useNavigationType`). */
export type BackTrailNavigation = 'PUSH' | 'REPLACE' | 'POP';

interface BackTrailEntry {
  /** The entry this one was opened from (always the entry just before it in the history), or null: back goes up. */
  readonly origin: string | null;
  readonly pathname: string;
  readonly title: string | null;
}

/**
 * What the shell remembers in this visit (memory only, D218): for each history entry, the entry it was opened from,
 * its page and the title it showed. An entry is named by React Router's location key and its page together
 * (`backTrailEntryId`): an entry the browser made itself (a "#" link) has no key of its own and reads as "default",
 * the first screen's key. A reload starts with an empty trail.
 */
export type BackTrail = ReadonlyMap<string, BackTrailEntry>;

export const EMPTY_BACK_TRAIL: BackTrail = new Map();

/** The trail's name for a history entry. */
export function backTrailEntryId(key: string, pathname: string): string {
  return `${key}\n${pathname}`;
}

/**
 * The trail after the app shows the entry `id` (at `pathname`), arriving from the entry `fromId` (null on the first
 * screen). A push remembers where it came from, unless it was "up" to a parent (going back down is not the way back);
 * a replace takes over the replaced entry's origin (that entry is gone from the history); a pop returns to an entry
 * whose origin is already remembered. An unknown entry reached by a pop on the same page is one the browser added
 * after the page it came from (a "#" link), so it was opened from there; any other unknown one is from before a reload.
 */
export function recordBackTrailNavigation(trail: BackTrail, navigation: Readonly<{ kind: BackTrailNavigation; id: string; pathname: string; fromId: string | null; up?: boolean }>): BackTrail {
  const { kind, id, pathname, fromId, up = false } = navigation;
  const known = trail.get(id);
  if (known !== undefined && (kind === 'POP' || id === fromId)) return trail;
  const from = fromId === null ? undefined : trail.get(fromId);
  const origin = fromId === null || id === fromId ? known?.origin ?? null
    : kind === 'POP' ? (from?.pathname === pathname ? fromId : null)
    : kind === 'PUSH' ? (up ? null : fromId)
    : from?.origin ?? null;
  // The same page under a new address (a changed period, a step) shows the same title until its h1 says otherwise.
  const title = known?.title ?? (from?.pathname === pathname ? from.title : null);
  return new Map(trail).set(id, Object.freeze({ origin, pathname, title }));
}

/** The trail once the entry `id` shows its title (the page's h1). */
export function recordBackTrailTitle(trail: BackTrail, id: string, title: string): BackTrail {
  const entry = trail.get(id);
  if (entry === undefined || title === '' || entry.title === title) return trail;
  return new Map(trail).set(id, Object.freeze({ ...entry, title }));
}

/** Where the back control goes: `steps` entries back in the history, to the page it was opened from, or up to its parent. */
export type BackStep =
  | Readonly<{ kind: 'back'; steps: number; label: string }>
  | Readonly<{ kind: 'up'; to: string; label: string }>;

/**
 * The back control for the entry `id` on a page whose parent is `parent` (null for a tab: no control). Back to the
 * last other page it was opened from in this visit, named by that page's title (entries of the same page, such as a
 * changed period, are passed over); else up to the parent, named by the parent's title.
 */
export function backStepOf(trail: BackTrail, id: string, parent: KairosPageParent | null): BackStep | null {
  if (parent === null) return null;
  const here = trail.get(id);
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
