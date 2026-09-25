/**
 * P28: the plain words for strategy rules, shared by features/discipline and features/journal (which may not import each other, ARCHITECTURE §4). Numbers are shown exactly as their owners give them.
 */

import type { StrategyRule } from '../../domain/discipline';

/** One rule as a plain sentence. */
export function describeStrategyRule(rule: StrategyRule): string {
  switch (rule.kind) {
    case 'max-risk': return `Risk at most ${rule.amount} ${rule.currency} on one trade`;
    case 'min-reward-to-risk': return `Aim to make at least ${rule.ratio}× what I risk`;
    case 'stop-planned': return 'Plan a stop before every trade';
    case 'checklist-complete': return 'Tick every step of my checklist before the trade';
    case 'markets': return `Trade only ${rule.symbols.join(', ')}`;
    case 'written': return rule.label;
  }
}
