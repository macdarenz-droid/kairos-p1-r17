/**
 * P29: the plain words of the offline coach. Every number is shown exactly as its owner gives it; nothing is worked out here except which sentence to use. Next steps are about process, never about the market.
 */

import { describeStrategyRuleResult } from '../discipline/strategyWords';
import type { TradePlanVsExecution } from '../trades/planVsExecution';
import type { CoachNote } from './coachNotes';

function stopSentence(stop: string, averageExit: string): string {
  return `Your stop was ${stop}, and you closed at ${averageExit} on average, beyond it.`;
}

function sizeSentence(planned: string, traded: string): string {
  return `You planned a size of ${planned} and traded ${traded}.`;
}

/** The card line: a sentence for a passed stop, then one for a bigger size; nothing else. */
export function describeTradePlanVsExecution(result: TradePlanVsExecution): readonly string[] {
  const lines: string[] = [];
  if (result.stop.verdict === 'passed') lines.push(stopSentence(result.stop.stop, result.stop.averageExit));
  if (result.size.verdict === 'bigger') lines.push(sizeSentence(result.size.planned, result.size.traded));
  return Object.freeze(lines);
}

export interface CoachNoteWords {
  /** A short label for the kind of note. */
  readonly topic: string;
  /** What the coach saw, in one sentence. */
  readonly title: string;
  /** One next step about process; never a market call. */
  readonly step: string;
}

const tradesWord = (count: number) => (count === 1 ? '1 trade' : `${count} trades`);

/** The topic, what the coach saw and one next step for a note. */
export function describeCoachNote(note: CoachNote): CoachNoteWords {
  switch (note.kind) {
    case 'daily-limit':
      return Object.freeze({
        topic: 'Your goals',
        title: note.exceeded ? `You opened ${note.today} trades today, more than your limit of ${note.limit}.` : `You reached your limit of ${tradesWord(note.limit)} today.`,
        step: "Stop for today. Use the time to review today's trades instead.",
      });
    case 'stop-passed': {
      const n = note.trades.length;
      return Object.freeze({
        topic: 'Your plan',
        title: n === 1 ? '1 trade this month closed beyond its stop.' : `${n} trades this month closed beyond their stop.`,
        step: 'Decide your stop before you enter, and close the trade when the price reaches it. Prices can jump past a stop; if you moved yours, say why in your review.',
      });
    }
    case 'size-over-plan': {
      const n = note.trades.length;
      return Object.freeze({
        topic: 'Your plan',
        title: n === 1 ? '1 trade this month was bigger than you planned.' : `${n} trades this month were bigger than you planned.`,
        step: 'Work out your size before you enter, and trade only that size. The "How much can I buy?" calculator in the Library can help.',
      });
    }
    case 'strategy-rules-broken': {
      const n = note.trades.length;
      return Object.freeze({
        topic: 'Your strategy',
        title: n === 1 ? '1 trade this month broke a rule of its strategy.' : `${n} trades this month broke a rule of their strategy.`,
        step: 'Read the rules that were broken, and plan your next trade so it keeps them.',
      });
    }
    case 'mistake-repeated':
      return Object.freeze({
        topic: 'Your mistakes',
        title: `You marked "${note.label}" on ${note.count} trades this month.`,
        step: 'Add a step to your checklist that guards against it (More → Settings → Your checklist), and tick it before you enter.',
      });
    case 'reviews-missing':
      return Object.freeze({
        topic: 'Your reviews',
        title: `You reviewed ${note.reviewedCount} of your ${note.closedCount} closed ${note.closedCount === 1 ? 'trade' : 'trades'} this month.`,
        step: 'In your trade history, tap "After the trade" on each trade that is not reviewed yet, while you still remember it.',
      });
  }
}

/** The facts for one trade a note names, in the same words as the card line. */
export function describeCoachTradeFacts(note: CoachNote, index: number): readonly string[] {
  switch (note.kind) {
    case 'stop-passed': {
      const trade = note.trades[index];
      return Object.freeze(trade ? [stopSentence(trade.stop, trade.averageExit)] : []);
    }
    case 'size-over-plan': {
      const trade = note.trades[index];
      return Object.freeze(trade ? [sizeSentence(trade.planned, trade.traded)] : []);
    }
    case 'strategy-rules-broken': {
      const trade = note.trades[index];
      return Object.freeze(trade ? [`Strategy: ${trade.strategyName}.`, ...trade.broken.map(describeStrategyRuleResult)] : []);
    }
    default:
      return Object.freeze([]);
  }
}
