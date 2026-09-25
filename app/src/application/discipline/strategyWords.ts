/**
 * P28: the plain words for strategy rules, shared by features/discipline and features/journal (which may not import each other, ARCHITECTURE §4). Numbers are shown exactly as their owners give them.
 */

import type { StrategyRule } from '../../domain/discipline';
import type { StrategyRuleResult, TradeStrategyCheck } from './strategyCheck';

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

/** One rule result as a plain sentence. */
export function describeStrategyRuleResult(result: StrategyRuleResult): string {
  switch (result.kind) {
    case 'max-risk':
      switch (result.reason) {
        case 'within': return `Risk: ${result.risk} ${result.currency}, within your most of ${result.limit} ${result.currency}.`;
        case 'over': return `Risk: ${result.risk} ${result.currency} is more than your most, ${result.limit} ${result.currency}.`;
        case 'plan-incomplete': return 'Risk: add your planned entry, stop and quantity so Kairos can check it.';
        case 'no-currency': return `Risk: add the price currency so Kairos can compare it with your most, ${result.limit} ${result.currency}.`;
        case 'other-currency': return `Risk: this trade's prices are in ${result.tradeCurrency}, your most is in ${result.currency}. Kairos does not convert currencies.`;
      }
      break;
    case 'min-reward-to-risk': {
      const about = result.shownRatio !== result.ratio ? 'about ' : '';
      switch (result.reason) {
        case 'at-least': return `Reward: ${about}${result.shownRatio}× what you risk, at least your ${result.least}×.`;
        case 'below': return `Reward: ${about}${result.shownRatio}× what you risk, less than your ${result.least}×.`;
        case 'plan-incomplete': return 'Reward: add the direction and your planned entry, stop and target so Kairos can check it.';
        case 'levels-not-ordered': return "Reward: your stop or target is on the wrong side of your entry, so Kairos can't check it.";
      }
      break;
    }
    case 'stop-planned':
      return result.reason === 'planned' ? `Stop: planned at ${result.stop}.` : 'Stop: no planned stop on this trade.';
    case 'checklist-complete':
      switch (result.reason) {
        case 'every-step': return 'Checklist: you ticked every step.';
        case 'steps-missed': return `Checklist: you ticked ${result.ticked} of ${result.asked} steps.`;
        case 'no-checklist': return "Checklist: none was saved before this trade closed, so Kairos can't check it.";
        case 'cancelled': return 'Checklist: this trade was cancelled before a checklist was ticked.';
        case 'not-yet': return 'Checklist: not ticked yet. You can tick it on the trade card while the trade is a draft or open.';
      }
      break;
    case 'markets':
      switch (result.reason) {
        case 'listed': return `Market: ${result.symbol} is on your list.`;
        case 'not-listed': return `Market: ${result.symbol} is not on your list (${result.symbols.join(', ')}).`;
        case 'no-market': return 'Market: add the symbol so Kairos can check it.';
      }
      break;
    case 'written':
      return result.reason === 'said-yes' ? `${result.label}: you kept it.` : result.reason === 'said-no' ? `${result.label}: you did not keep it.` : `${result.label}: not ticked yet.`;
  }
  return '';
}

/** The whole check in one sentence. Every number comes from the check owner. */
export function describeTradeStrategyCheck(check: TradeStrategyCheck, name: string): string {
  const rules = check.total === 1 ? 'rule' : 'rules';
  if (check.broken > 0) return `This trade breaks ${check.broken} of your ${check.total} ${name} ${rules}.`;
  if (check.unknown > 0) return `This trade keeps ${check.kept} of your ${check.total} ${name} ${rules} so far; ${check.unknown} still to check.`;
  return check.total === 1 ? `This trade keeps your ${name} rule.` : `This trade keeps all ${check.total} of your ${name} rules.`;
}
