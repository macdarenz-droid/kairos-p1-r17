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
      /** U13 (D251): every tagged mistake, most frequent first (then by label). */
      mistakes: readonly DisciplineMistakeCount[];
      /** The first DISCIPLINE_TOP_MISTAKES of `mistakes`. */
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
  const allMistakes = Object.freeze([...mistakes]
    .map(([itemId, counted]) => Object.freeze({ itemId, label: counted.label, count: counted.count }))
    .sort((left, right) => right.count - left.count || compare(left.label, right.label) || compare(left.itemId, right.itemId)));
  const topMistakes = Object.freeze(allMistakes.slice(0, DISCIPLINE_TOP_MISTAKES));

  return Object.freeze({
    available: true as const,
    score,
    basis: checklist === null ? 'reviews-only' as const : 'checklist-and-reviews' as const,
    checklist,
    review,
    mistakes: allMistakes,
    topMistakes,
  });
}

/** One month's score, as `projectDisciplineScore` gave it, for the trend. */
export interface DisciplineScoreMonth {
  readonly monthKey: string;
  readonly score: DisciplineScoreProjection;
}

/** A common mistake's count each month: null when the month had no reviewed trade (no review is not "no mistake"). */
export interface DisciplineMistakeTrend {
  readonly itemId: string;
  readonly label: string;
  readonly total: number;
  readonly counts: readonly Readonly<{ monthKey: string; count: number | null }>[];
}

export interface DisciplineTrend {
  /** Oldest first; null for a month with no closed trade (a gap, never 0). */
  readonly scores: readonly Readonly<{ monthKey: string; score: number | null }>[];
  /** The DISCIPLINE_TOP_MISTAKES most frequent over the months shown. */
  readonly mistakes: readonly DisciplineMistakeTrend[];
}

/**
 * U13 (D251): the score and the common mistakes month by month, over the last `window` months given (oldest first).
 * Each month's numbers are its own `projectDisciplineScore`; nothing is counted twice.
 */
export function projectDisciplineTrend(input: Readonly<{ months: readonly DisciplineScoreMonth[]; window: number }>): DisciplineTrend {
  const months = input.months.slice(-Math.max(0, input.window));
  const totals = new Map<string, { label: string; total: number }>();
  for (const month of months) {
    if (!month.score.available) continue;
    // The newest month's label wins, as within a month.
    for (const mistake of month.score.mistakes) {
      const counted = totals.get(mistake.itemId);
      totals.set(mistake.itemId, { label: mistake.label, total: (counted?.total ?? 0) + mistake.count });
    }
  }
  const common = [...totals]
    .map(([itemId, counted]) => ({ itemId, label: counted.label, total: counted.total }))
    .sort((left, right) => right.total - left.total || compare(left.label, right.label) || compare(left.itemId, right.itemId))
    .slice(0, DISCIPLINE_TOP_MISTAKES);
  return Object.freeze({
    scores: Object.freeze(months.map(month => Object.freeze({ monthKey: month.monthKey, score: month.score.available ? month.score.score : null }))),
    mistakes: Object.freeze(common.map(mistake => Object.freeze({
      ...mistake,
      counts: Object.freeze(months.map(month => Object.freeze({
        monthKey: month.monthKey,
        count: !month.score.available || month.score.review.reviewedCount === 0 ? null : month.score.mistakes.find(item => item.itemId === mistake.itemId)?.count ?? 0,
      }))),
    }))),
  });
}
