import type { Brand, TradeId } from '../trades/tradeTypes';

/** P36.1 discipline record identity: one record per trade, canonical stable id. */
export type TradeDisciplineId = Brand<string, 'TradeDisciplineId'>;

/** Stable id of one checklist item, review item or mistake tag. Default items use the L36.1 keys; new items get `createDisciplineListItemId()`. */
export type DisciplineListItemId = string;

/** The pre-trade checklist the vision's Discipline pillar asks before a trade is taken. Fixed vocabulary; the answer is the trader's own. */
export const KAIROS_PRE_TRADE_CHECKLIST_KEYS = Object.freeze([
  'plan-written',
  'risk-defined',
  'stop-placed',
  'size-within-limit',
  'setup-matches-rules',
] as const);
export type PreTradeChecklistKey = (typeof KAIROS_PRE_TRADE_CHECKLIST_KEYS)[number];

/** The post-trade review asked after a trade is closed. Fixed vocabulary. */
export const KAIROS_POST_TRADE_REVIEW_KEYS = Object.freeze([
  'followed-plan',
  'respected-stop',
  'exit-per-plan',
  'emotions-in-check',
] as const);
export type PostTradeReviewKey = (typeof KAIROS_POST_TRADE_REVIEW_KEYS)[number];

/** Mistake tags the trader can attach to a reviewed trade. Fixed vocabulary; a later phase may extend it append-only. */
export const KAIROS_DISCIPLINE_MISTAKE_TAGS = Object.freeze([
  'no-plan',
  'moved-stop',
  'oversized',
  'chased-entry',
  'early-exit',
  'late-exit',
  'revenge-trade',
  'ignored-rules',
] as const);
export type DisciplineMistakeTag = (typeof KAIROS_DISCIPLINE_MISTAKE_TAGS)[number];

export type DisciplineAnswer = 'yes' | 'no';

export interface PreTradeChecklistAnswer {
  readonly key: PreTradeChecklistKey;
  readonly answer: DisciplineAnswer;
}

export interface PostTradeReviewAnswer {
  readonly key: PostTradeReviewKey;
  readonly answer: DisciplineAnswer;
}

/** Longest discipline note kept verbatim. */
export const KAIROS_DISCIPLINE_NOTE_MAX_LENGTH = 500 as const;

/**
 * P36.1 trade discipline record: the trader's own answers about one trade.
 *
 * One record per trade (`tradeId` is unique across the store). Every list is
 * append-only vocabulary with unique keys; `checklistCompletedAt` and
 * `reviewedAt` are the moments the trader last answered each half, or null
 * when that half has not been answered. Never journal truth: nothing about
 * fills, sizing or outcomes lives here.
 */
export interface TradeDisciplineRecord {
  readonly id: TradeDisciplineId;
  readonly tradeId: TradeId;
  readonly preTradeChecklist: readonly PreTradeChecklistAnswer[];
  readonly postTradeReview: readonly PostTradeReviewAnswer[];
  readonly mistakes: readonly DisciplineMistakeTag[];
  readonly note: string;
  readonly checklistCompletedAt: string | null;
  readonly reviewedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
