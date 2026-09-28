import type { TradeDisciplineRecord } from '../../domain/discipline';
import { summarizeTradeChecklist, summarizeTradeReview } from './tradeDisciplineSummary';

export const DISCIPLINE_TOP_MISTAKES = 3 as const;

export interface DisciplineScoreInput {
  /** Every closed real trade in the period (from listJournalClosedTradesInPeriod). Repeats count once. */
  readonly closedTradeIds: readonly string[];
  /** The saved record of each trade that has one, by trade id. */
  readonly records: ReadonlyMap<string, TradeDisciplineRecord>;
}

export interface DisciplineChecklistPart {
  /** Closed trades with a saved checklist. */
  readonly tradeCount: number;
  /** Of those, trades with every step ticked. */
  readonly fullTradeCount: number;
  /** Steps ticked over those trades. */
  readonly tickedCount: number;
  /** Steps asked over those trades. */
  readonly askedCount: number;
  /** tickedCount ÷ askedCount, 0–100, half up. */
  readonly percent: number;
}

export interface DisciplineReviewPart {
  readonly reviewedCount: number;
  readonly closedCount: number;
  /** reviewedCount ÷ closedCount, 0–100, half up. */
  readonly percent: number;
}

export interface DisciplineMistakeCount {
  readonly itemId: string;
  readonly label: string;
  readonly count: number;
}

export type DisciplineScoreProjection =
  | Readonly<{ available: false; reason: 'no-closed-trades' }>
  | Readonly<{
      available: true;
      /** 0–100 whole number. */
      score: number;
      basis: 'checklist-and-reviews' | 'reviews-only';
      /** null: no closed trade in the period had a saved checklist. */
      checklist: DisciplineChecklistPart | null;
      review: DisciplineReviewPart;
      /** At most DISCIPLINE_TOP_MISTAKES, most frequent first. */
      topMistakes: readonly DisciplineMistakeCount[];
    }>;

/** n ÷ d as a whole percent, half up, in whole numbers only (these are counts, never money). */
const percentHalfUp = (n: number, d: number): number => Math.floor((200 * n + d) / (2 * d));

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/**
 * P22.4 the one owner of the discipline score of a period: how well the
 * trader followed their own checklist and reviewed their closed trades.
 * Checklist and reviews weigh the same; with no checklist in the period the
 * reviews alone make the score. Mistakes are counted apart and never lower
 * the score. It sees only trade ids and discipline records, never a result,
 * a count of trades or a streak, so the same ratios always give the same score.
 */
export function projectDisciplineScore(input: DisciplineScoreInput): DisciplineScoreProjection {
  const ids = [...new Set(input.closedTradeIds)];
  if (ids.length === 0) return Object.freeze({ available: false as const, reason: 'no-closed-trades' as const });

  let tradeCount = 0, fullTradeCount = 0, tickedCount = 0, askedCount = 0, reviewedCount = 0;
  const mistakes = new Map<string, { label: string; updatedAt: string; count: number }>();
  for (const id of ids) {
    const record = input.records.get(id) ?? null;
    const checklist = summarizeTradeChecklist(record);
    if (checklist !== null) {
      tradeCount += 1;
      if (checklist.complete) fullTradeCount += 1;
      tickedCount += checklist.ticked;
      askedCount += checklist.asked;
    }
    if (record === null || !summarizeTradeReview(record).reviewed) continue;
    reviewedCount += 1;
    const seen = new Set<string>();
    for (const mark of record.mistakes) {
      if (seen.has(mark.itemId)) continue;
      seen.add(mark.itemId);
      const counted = mistakes.get(mark.itemId);
      if (counted === undefined) mistakes.set(mark.itemId, { label: mark.label, updatedAt: record.updatedAt, count: 1 });
      else {
        counted.count += 1;
        // The label as written in the newest record; on a tie, the first one met stays.
        if (record.updatedAt > counted.updatedAt) { counted.label = mark.label; counted.updatedAt = record.updatedAt; }
      }
    }
  }

  const closedCount = ids.length;
  const review: DisciplineReviewPart = Object.freeze({ reviewedCount, closedCount, percent: percentHalfUp(reviewedCount, closedCount) });
  const checklist: DisciplineChecklistPart | null = tradeCount === 0
    ? null
    : Object.freeze({ tradeCount, fullTradeCount, tickedCount, askedCount, percent: percentHalfUp(tickedCount, askedCount) });
  const score = checklist === null
    ? percentHalfUp(reviewedCount, closedCount)
    : percentHalfUp(tickedCount * closedCount + reviewedCount * askedCount, 2 * askedCount * closedCount);
  const topMistakes = Object.freeze([...mistakes]
    .map(([itemId, counted]) => Object.freeze({ itemId, label: counted.label, count: counted.count }))
    .sort((left, right) => right.count - left.count || compare(left.label, right.label) || compare(left.itemId, right.itemId))
    .slice(0, DISCIPLINE_TOP_MISTAKES));

  return Object.freeze({
    available: true as const,
    score,
    basis: checklist === null ? 'reviews-only' as const : 'checklist-and-reviews' as const,
    checklist,
    review,
    topMistakes,
  });
}
