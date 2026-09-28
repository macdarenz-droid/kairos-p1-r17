/**
 * U4 (P11.A1): the longest run of wins and of losses, by trade, in the order given (closing order). A break-even or unknown result ends both runs, as an unavailable day resets the daily streak. On a tie the earliest run is kept. Counts only, never money.
 */

import type { VisualPnlOutcome } from './outcomeProjection';

export interface VisualPnlTradeStreak { readonly length: number; readonly firstId: string | null; readonly lastId: string | null }
export interface VisualPnlLongestTradeStreaks { readonly win: VisualPnlTradeStreak; readonly loss: VisualPnlTradeStreak }

export function projectVisualPnlLongestTradeStreaks(results: readonly Readonly<{ id: string; outcome: VisualPnlOutcome }>[]): VisualPnlLongestTradeStreaks {
  const longest = { profit: { length: 0, firstId: null as string | null, lastId: null as string | null }, loss: { length: 0, firstId: null as string | null, lastId: null as string | null } };
  let outcome: 'profit' | 'loss' | null = null;
  let length = 0;
  let firstId: string | null = null;
  for (const result of results) {
    if (result.outcome !== 'profit' && result.outcome !== 'loss') {
      outcome = null;
      length = 0;
      firstId = null;
      continue;
    }
    if (result.outcome !== outcome) {
      outcome = result.outcome;
      length = 0;
      firstId = result.id;
    }
    length += 1;
    if (length > longest[outcome].length) longest[outcome] = { length, firstId, lastId: result.id };
  }
  return Object.freeze({ win: Object.freeze(longest.profit), loss: Object.freeze(longest.loss) });
}
