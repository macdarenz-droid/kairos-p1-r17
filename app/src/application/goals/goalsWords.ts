/**
 * U13 (D249): the plain sentences of the new goals, for the Goals page, Analysis and Home. Every number comes from
 * `projectGoalsProgress`; here only words are chosen. Null means the goal is not set.
 */
import type { GoalsLossProgress, GoalsReviewProgress, GoalsTickProgress } from './goalsProgress';

const trades = (count: number) => (count === 1 ? '1 trade' : `${count} trades`);

/** "Lost 40 of 100 USDT · 60 left", "Nothing lost today · your most is 100 USDT", or why Kairos can't tell yet. */
export function describeLoss(loss: GoalsLossProgress, period: 'today' | 'this week'): string | null {
  if (loss.kind === 'unset') return null;
  if (loss.kind === 'unknown') return `Kairos can't tell yet: ${trades(loss.uncounted)} closed ${period} ${loss.uncounted === 1 ? 'has' : 'have'} no result in ${loss.currency}.`;
  if (loss.lost === '0') return `Nothing lost ${period} · your most is ${loss.limit} ${loss.currency}`;
  const tail = loss.state === 'over' ? 'over your limit' : loss.state === 'at-limit' ? 'at your limit' : `${loss.left} left`;
  return `Lost ${loss.lost} of ${loss.limit} ${loss.currency} · ${tail}`;
}

/** Home's short line: "Lost today: 40 of 100 USDT". */
export function describeLossShort(loss: GoalsLossProgress, period: 'today' | 'this week'): string | null {
  if (loss.kind === 'unset') return null;
  if (loss.kind === 'unknown') return `Lost ${period}: Kairos can't tell yet`;
  return `Lost ${period}: ${loss.lost} of ${loss.limit} ${loss.currency}${loss.state === 'over' ? ' · over your limit' : ''}`;
}

export function describeReviewEveryTrade(review: GoalsReviewProgress): string | null {
  if (review.kind === 'unset') return null;
  if (review.kind === 'unavailable') return 'Kairos could not read your reviews. Try again.';
  if (review.closed === 0) return 'No closed trades yet this month.';
  if (review.reached) return review.closed === 1 ? 'Your 1 closed trade is reviewed' : `All ${review.closed} closed trades reviewed`;
  return `${review.reviewed} of ${review.closed} closed trades reviewed · ${review.closed - review.reviewed} to review`;
}

export function describeTickEveryStep(tick: GoalsTickProgress): string | null {
  if (tick.kind === 'unset') return null;
  if (tick.kind === 'unavailable') return 'Kairos could not read your checklists. Try again.';
  if (tick.kind === 'no-steps') return 'Your checklist has no steps yet. Add them under Analysis › Discipline.';
  if (tick.closed === 0) return 'No closed trades yet this month.';
  if (tick.reached) return tick.closed === 1 ? 'Every step ticked on your 1 closed trade' : `Every step ticked on all ${tick.closed} closed trades`;
  return `Every step ticked on ${tick.ticked} of ${tick.closed} closed trades`;
}

/** Home's short lines for the habits: "Reviewed: 8 of 10 closed trades". */
export function describeReviewShort(review: GoalsReviewProgress): string | null {
  return review.kind === 'progress' ? `Reviewed: ${review.reviewed} of ${review.closed} closed trades` : null;
}

export function describeTickShort(tick: GoalsTickProgress): string | null {
  return tick.kind === 'progress' ? `Every step ticked: ${tick.ticked} of ${tick.closed} closed trades` : null;
}
