/**
 * P29: the one owner of the offline coach's notes. A closed set of typed rules over facts that already have owners: goals, plan vs what was done, the strategy check, the discipline score and the review summary. It holds the trader only to their own plan, rules, goals and reviews. Counts and amounts come from their owners; this module only chooses which notes exist and names their trades. Missing facts never make a note.
 */

import type { TradeDisciplineRecord } from '../../domain/discipline';
import type { DecimalString, TradeId } from '../../domain/trades';
import { checkSavedTradeStrategy, type StrategyRuleResult } from '../discipline/strategyCheck';
import type { DisciplineScoreProjection } from '../discipline/disciplineScore';
import { summarizeTradeReview } from '../discipline/tradeDisciplineSummary';
import type { GoalsProgressProjection } from '../goals/goalsProgress';
import type { JournalHistoryEntry } from '../journal/historyQuery';
import { projectTradePlanVsExecution } from '../trades/planVsExecution';

export const COACH_NOTE_KINDS = Object.freeze(['daily-limit', 'stop-passed', 'size-over-plan', 'strategy-rules-broken', 'mistake-repeated', 'reviews-missing'] as const);
export type CoachNoteKind = (typeof COACH_NOTE_KINDS)[number];
/** A mistake is "repeated" from its second tagged trade. */
export const COACH_REPEATED_MISTAKE_LEAST = 2;

/** One trade a note is about. */
export interface CoachTrade {
  readonly tradeId: TradeId;
  readonly symbol: string;
  /** When the trade closed (UTC ISO), from the trade record. */
  readonly closedAt: string | null;
}

export type CoachNote =
  | Readonly<{ kind: 'daily-limit'; key: string; limit: number; today: number; exceeded: boolean }>
  | Readonly<{ kind: 'stop-passed'; key: string; trades: readonly (CoachTrade & Readonly<{ stop: DecimalString; averageExit: DecimalString }>)[] }>
  | Readonly<{ kind: 'size-over-plan'; key: string; trades: readonly (CoachTrade & Readonly<{ planned: DecimalString; traded: DecimalString }>)[] }>
  | Readonly<{ kind: 'strategy-rules-broken'; key: string; trades: readonly (CoachTrade & Readonly<{ strategyName: string; broken: readonly StrategyRuleResult[] }>)[] }>
  | Readonly<{ kind: 'mistake-repeated'; key: string; itemId: string; label: string; count: number; trades: readonly CoachTrade[] }>
  | Readonly<{ kind: 'reviews-missing'; key: string; reviewedCount: number; closedCount: number; percent: number; trades: readonly CoachTrade[] }>;

export interface CoachNotesInput {
  /** Every closed trade of one scope this month (listJournalClosedTradesInPeriod), oldest close first. */
  readonly entries: readonly JournalHistoryEntry[];
  /** Their saved discipline records by trade id (loadTradeDiscipline). */
  readonly records: ReadonlyMap<string, TradeDisciplineRecord>;
  /** projectDisciplineScore over exactly these trades. */
  readonly score: DisciplineScoreProjection;
  /** The goals projection for real trades; null for practice or when goals could not be read. */
  readonly goals: GoalsProgressProjection | null;
}

const frozenList = <T>(items: readonly T[]): readonly T[] => Object.freeze(items.map(item => Object.freeze(item)));

export function projectCoachNotes(input: CoachNotesInput): readonly CoachNote[] {
  const notes: CoachNote[] = [];
  const { goals, score } = input;
  if (goals?.kind === 'ready' && goals.maxTradesPerDay.kind === 'limit' && goals.maxTradesPerDay.remaining === 0) {
    const { limit, today, exceeded } = goals.maxTradesPerDay;
    notes.push({ kind: 'daily-limit', key: 'daily-limit', limit, today, exceeded });
  }

  const stopPassed: (CoachTrade & { stop: DecimalString; averageExit: DecimalString })[] = [];
  const sizeOver: (CoachTrade & { planned: DecimalString; traded: DecimalString })[] = [];
  const strategyBroken: (CoachTrade & { strategyName: string; broken: readonly StrategyRuleResult[] })[] = [];
  const unreviewed: CoachTrade[] = [];
  for (const entry of input.entries) {
    const record = input.records.get(entry.trade.id) ?? null;
    const trade: CoachTrade = { tradeId: entry.trade.id, symbol: entry.trade.symbol, closedAt: entry.trade.closedAt };
    const plan = projectTradePlanVsExecution(entry.trade, entry.plans, entry.metrics);
    if (plan.stop.verdict === 'passed') stopPassed.push({ ...trade, stop: plan.stop.stop, averageExit: plan.stop.averageExit });
    if (plan.size.verdict === 'bigger') sizeOver.push({ ...trade, planned: plan.size.planned, traded: plan.size.traded });
    const check = checkSavedTradeStrategy(entry.trade, entry.plans, record);
    if (check !== null && check.broken > 0 && record?.strategy !== undefined) {
      strategyBroken.push({ ...trade, strategyName: record.strategy.name, broken: Object.freeze(check.results.filter(result => result.verdict === 'broken')) });
    }
    if (!summarizeTradeReview(record).reviewed) unreviewed.push(trade);
  }
  if (stopPassed.length > 0) notes.push({ kind: 'stop-passed', key: 'stop-passed', trades: frozenList(stopPassed) });
  if (sizeOver.length > 0) notes.push({ kind: 'size-over-plan', key: 'size-over-plan', trades: frozenList(sizeOver) });
  if (strategyBroken.length > 0) notes.push({ kind: 'strategy-rules-broken', key: 'strategy-rules-broken', trades: frozenList(strategyBroken) });

  if (score.available) {
    for (const mistake of score.topMistakes) {
      if (mistake.count < COACH_REPEATED_MISTAKE_LEAST) continue;
      // The same set the score owner counted: reviewed trades with this mark.
      const trades = input.entries.filter(entry => {
        const record = input.records.get(entry.trade.id) ?? null;
        return summarizeTradeReview(record).reviewed && record!.mistakes.some(mark => mark.itemId === mistake.itemId);
      }).map((entry): CoachTrade => ({ tradeId: entry.trade.id, symbol: entry.trade.symbol, closedAt: entry.trade.closedAt }));
      notes.push({ kind: 'mistake-repeated', key: `mistake-repeated:${mistake.itemId}`, itemId: mistake.itemId, label: mistake.label, count: mistake.count, trades: frozenList(trades) });
    }
    if (score.review.reviewedCount < score.review.closedCount) {
      const { reviewedCount, closedCount, percent } = score.review;
      notes.push({ kind: 'reviews-missing', key: 'reviews-missing', reviewedCount, closedCount, percent, trades: frozenList(unreviewed) });
    }
  }
  return Object.freeze(notes.map(note => Object.freeze(note)));
}
