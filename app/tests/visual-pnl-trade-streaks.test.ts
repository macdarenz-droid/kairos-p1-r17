import { describe, expect, it } from 'vitest';
import { projectVisualPnlLongestTradeStreaks, type VisualPnlOutcome } from '../src/application/visual-pnl';

const CODE: Record<string, VisualPnlOutcome> = { P: 'profit', L: 'loss', B: 'breakeven', U: 'unavailable' };
const run = (codes: string) => codes.split(' ').map((code, i) => ({ id: `t${i + 1}`, outcome: CODE[code] }));

describe('U4 longest runs of wins and losses by trade', () => {
  it('finds the longest win and loss runs; break-even ends a run', () => {
    const streaks = projectVisualPnlLongestTradeStreaks(run('P P L P P P B L L'));
    expect(streaks).toEqual({ win: { length: 3, firstId: 't4', lastId: 't6' }, loss: { length: 2, firstId: 't8', lastId: 't9' } });
    expect(Object.isFrozen(streaks) && Object.isFrozen(streaks.win) && Object.isFrozen(streaks.loss)).toBe(true);
  });

  it('ends a run at a trade with no result', () => {
    expect(projectVisualPnlLongestTradeStreaks(run('P P U P P L')).win).toEqual({ length: 2, firstId: 't1', lastId: 't2' });
  });

  it('keeps the earlier run on a tie', () => {
    const streaks = projectVisualPnlLongestTradeStreaks(run('L L P P L L P P'));
    expect(streaks.win).toEqual({ length: 2, firstId: 't3', lastId: 't4' });
    expect(streaks.loss).toEqual({ length: 2, firstId: 't1', lastId: 't2' });
  });

  it('gives length 0 and no ids for an empty list', () => {
    expect(projectVisualPnlLongestTradeStreaks([])).toEqual({ win: { length: 0, firstId: null, lastId: null }, loss: { length: 0, firstId: null, lastId: null } });
  });
});
