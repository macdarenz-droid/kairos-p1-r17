import { describe, expect, it } from 'vitest';
import { backStepOf, backTrailEntryId, EMPTY_BACK_TRAIL, recordBackTrailNavigation, recordBackTrailTitle, type BackTrail } from '../src/app/backTrail';

const MORE = { to: '/more', label: 'More' } as const;
const PRACTICE = { to: '/practice', label: 'Practice' } as const;
const LIBRARY = { to: '/library', label: 'Library' } as const;
const id = backTrailEntryId;

type Step = readonly [kind: 'PUSH' | 'REPLACE' | 'POP', key: string, pathname: string, title?: string, up?: boolean];

/** Shows entries in order, each with its kind, and the title each page's h1 gives. Returns the trail and the last entry. */
function walk(steps: readonly Step[], start: BackTrail = EMPTY_BACK_TRAIL, from: string | null = null): { trail: BackTrail; shown: string | null } {
  let trail = start;
  let shown = from;
  for (const [kind, key, pathname, title, up] of steps) {
    const entry = id(key, pathname);
    trail = recordBackTrailNavigation(trail, { kind, id: entry, pathname, fromId: shown, up });
    if (title !== undefined) trail = recordBackTrailTitle(trail, entry, title);
    shown = entry;
  }
  return { trail, shown };
}

describe('T-053a the back trail', () => {
  it('a page opened from another page goes back to it, named by its title', () => {
    const { trail } = walk([['POP', 'default', '/journal', 'Journal'], ['PUSH', 'k1', '/coach', 'Coach']]);
    expect(backStepOf(trail, id('k1', '/coach'), MORE)).toEqual({ kind: 'back', steps: 1, label: 'Journal' });
  });

  it('a page opened directly goes up to its parent', () => {
    const { trail } = walk([['POP', 'default', '/goals', 'Goals']]);
    expect(backStepOf(trail, id('default', '/goals'), MORE)).toEqual({ kind: 'up', to: '/more', label: 'More' });
  });

  it('a tab has no back control', () => {
    const { trail } = walk([['POP', 'default', '/journal', 'Journal']]);
    expect(backStepOf(trail, id('default', '/journal'), null)).toBeNull();
  });

  it('a replace keeps the replaced entry\'s origin, and a pop reads what was remembered', () => {
    let { trail } = walk([['POP', 'default', '/', 'Home'], ['PUSH', 'k1', '/practice', 'Practice'], ['REPLACE', 'k2', '/practice/replay', 'Replay the past']]);
    const replay = id('k2', '/practice/replay');
    expect(backStepOf(trail, replay, PRACTICE)).toEqual({ kind: 'back', steps: 1, label: 'Home' });
    // Back to Home, then forward again to the replay: its origin is still Home.
    trail = recordBackTrailNavigation(trail, { kind: 'POP', id: id('default', '/'), pathname: '/', fromId: replay });
    trail = recordBackTrailNavigation(trail, { kind: 'POP', id: replay, pathname: '/practice/replay', fromId: id('default', '/') });
    expect(backStepOf(trail, replay, PRACTICE)).toEqual({ kind: 'back', steps: 1, label: 'Home' });
  });

  it('an entry from before a reload has no origin', () => {
    const { trail } = walk([['POP', 'default', '/journal', 'Journal'], ['POP', 'old', '/goals', 'Goals']]);
    expect(backStepOf(trail, id('old', '/goals'), MORE)).toEqual({ kind: 'up', to: '/more', label: 'More' });
  });

  it('passes over entries of the same page, such as a changed period, and counts the steps', () => {
    const { trail } = walk([
      ['POP', 'default', '/journal', 'Journal'], ['PUSH', 'k1', '/practice', 'Practice'],
      ['PUSH', 'k2', '/practice'], ['PUSH', 'k3', '/practice'],
    ]);
    expect(backStepOf(trail, id('k3', '/practice'), MORE)).toEqual({ kind: 'back', steps: 3, label: 'Journal' });
    // A page opened from that changed period goes back one step, to Practice.
    const further = recordBackTrailNavigation(trail, { kind: 'PUSH', id: id('k4', '/practice/replay'), pathname: '/practice/replay', fromId: id('k3', '/practice') });
    expect(backStepOf(further, id('k4', '/practice/replay'), PRACTICE)).toEqual({ kind: 'back', steps: 1, label: 'Practice' });
  });

  it('goes up when the page it came from never showed a title', () => {
    const { trail } = walk([['POP', 'default', '/journal'], ['PUSH', 'k1', '/goals', 'Goals']]);
    expect(backStepOf(trail, id('k1', '/goals'), MORE)).toEqual({ kind: 'up', to: '/more', label: 'More' });
  });

  it('showing the same entry again changes nothing', () => {
    const { trail } = walk([['POP', 'default', '/journal', 'Journal'], ['PUSH', 'k1', '/coach', 'Coach']]);
    const coach = id('k1', '/coach');
    expect(recordBackTrailNavigation(trail, { kind: 'PUSH', id: coach, pathname: '/coach', fromId: coach })).toBe(trail);
    expect(recordBackTrailTitle(trail, coach, 'Coach')).toBe(trail);
  });

  it('T-053a fix r1: a "#" entry (key "default", like the first screen) never overwrites the first screen, and Back still names the right page', () => {
    // Journal (first screen) → Coach → Patterns → the skip link adds "#main" on Patterns (key "default") → Back → Back.
    let { trail } = walk([['POP', 'default', '/journal', 'Journal'], ['PUSH', 'k1', '/coach', 'Your coach'], ['PUSH', 'k2', '/patterns', 'Your patterns']]);
    const skip = id('default', '/patterns');
    trail = recordBackTrailNavigation(trail, { kind: 'POP', id: skip, pathname: '/patterns', fromId: id('k2', '/patterns') });
    // From the "#" entry, back passes over Patterns itself to Coach, two steps back.
    expect(backStepOf(trail, skip, MORE)).toEqual({ kind: 'back', steps: 2, label: 'Your coach' });
    trail = recordBackTrailNavigation(trail, { kind: 'POP', id: id('k2', '/patterns'), pathname: '/patterns', fromId: skip });
    trail = recordBackTrailNavigation(trail, { kind: 'POP', id: id('k1', '/coach'), pathname: '/coach', fromId: id('k2', '/patterns') });
    expect(backStepOf(trail, id('k1', '/coach'), MORE)).toEqual({ kind: 'back', steps: 1, label: 'Journal' });
  });

  it('T-053a fix r1: going up to a parent does not make the parent offer to go back down', () => {
    const { trail } = walk([['POP', 'default', '/library/lessons/stop', 'Set your stop first'], ['PUSH', 'k1', '/library/lessons', 'Lessons', true]]);
    expect(backStepOf(trail, id('k1', '/library/lessons'), LIBRARY)).toEqual({ kind: 'up', to: '/library', label: 'Library' });
  });
});
