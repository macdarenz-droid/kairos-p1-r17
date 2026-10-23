import { describe, expect, it } from 'vitest';
import { backStepOf, EMPTY_BACK_TRAIL, recordBackTrailNavigation, recordBackTrailTitle, type BackTrail } from '../src/app/backTrail';

const MORE = { to: '/more', label: 'More' } as const;
const PRACTICE = { to: '/practice', label: 'Practice' } as const;

/** Shows entries in order, each with its kind, and the title each page's h1 gives. */
function walk(steps: readonly (readonly [kind: 'PUSH' | 'REPLACE' | 'POP', key: string, pathname: string, title?: string])[]): BackTrail {
  let trail = EMPTY_BACK_TRAIL;
  let shown: string | null = null;
  for (const [kind, key, pathname, title] of steps) {
    trail = recordBackTrailNavigation(trail, { kind, key, pathname, fromKey: shown });
    if (title !== undefined) trail = recordBackTrailTitle(trail, key, title);
    shown = key;
  }
  return trail;
}

describe('T-053a the back trail', () => {
  it('a page opened from another page goes back to it, named by its title', () => {
    const trail = walk([['POP', 'default', '/journal', 'Journal'], ['PUSH', 'k1', '/coach', 'Coach']]);
    expect(backStepOf(trail, 'k1', MORE)).toEqual({ kind: 'back', steps: 1, label: 'Journal' });
  });

  it('a page opened directly goes up to its parent', () => {
    const trail = walk([['POP', 'default', '/goals', 'Goals']]);
    expect(backStepOf(trail, 'default', MORE)).toEqual({ kind: 'up', to: '/more', label: 'More' });
  });

  it('a tab has no back control', () => {
    const trail = walk([['POP', 'default', '/journal', 'Journal']]);
    expect(backStepOf(trail, 'default', null)).toBeNull();
  });

  it('a replace keeps the replaced entry\'s origin, and a pop reads what was remembered', () => {
    let trail = walk([['POP', 'default', '/', 'Home'], ['PUSH', 'k1', '/practice', 'Practice'], ['REPLACE', 'k2', '/practice/replay', 'Replay the past']]);
    expect(backStepOf(trail, 'k2', PRACTICE)).toEqual({ kind: 'back', steps: 1, label: 'Home' });
    // Back to Home, then forward again to the replay: its origin is still Home.
    trail = recordBackTrailNavigation(trail, { kind: 'POP', key: 'default', pathname: '/', fromKey: 'k2' });
    trail = recordBackTrailNavigation(trail, { kind: 'POP', key: 'k2', pathname: '/practice/replay', fromKey: 'default' });
    expect(backStepOf(trail, 'k2', PRACTICE)).toEqual({ kind: 'back', steps: 1, label: 'Home' });
  });

  it('an entry from before a reload has no origin', () => {
    const trail = walk([['POP', 'default', '/journal', 'Journal'], ['POP', 'old', '/goals', 'Goals']]);
    expect(backStepOf(trail, 'old', MORE)).toEqual({ kind: 'up', to: '/more', label: 'More' });
  });

  it('passes over entries of the same page, such as a changed period, and counts the steps', () => {
    const trail = walk([
      ['POP', 'default', '/journal', 'Journal'], ['PUSH', 'k1', '/practice', 'Practice'],
      ['PUSH', 'k2', '/practice'], ['PUSH', 'k3', '/practice'],
    ]);
    expect(backStepOf(trail, 'k3', MORE)).toEqual({ kind: 'back', steps: 3, label: 'Journal' });
    // A page opened from that changed period goes back one step, to Practice.
    const further = recordBackTrailNavigation(trail, { kind: 'PUSH', key: 'k4', pathname: '/practice/replay', fromKey: 'k3' });
    expect(backStepOf(further, 'k4', PRACTICE)).toEqual({ kind: 'back', steps: 1, label: 'Practice' });
  });

  it('goes up when the page it came from never showed a title', () => {
    const trail = walk([['POP', 'default', '/journal'], ['PUSH', 'k1', '/goals', 'Goals']]);
    expect(backStepOf(trail, 'k1', MORE)).toEqual({ kind: 'up', to: '/more', label: 'More' });
  });

  it('showing the same entry again changes nothing', () => {
    const once = walk([['POP', 'default', '/journal', 'Journal'], ['PUSH', 'k1', '/coach', 'Coach']]);
    expect(recordBackTrailNavigation(once, { kind: 'PUSH', key: 'k1', pathname: '/coach', fromKey: 'k1' })).toBe(once);
    expect(recordBackTrailTitle(once, 'k1', 'Coach')).toBe(once);
  });
});
