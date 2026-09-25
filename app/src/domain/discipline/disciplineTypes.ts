import type { Brand, DecimalString, TradeId } from '../trades/tradeTypes';

/** P36.1 discipline record identity: one record per trade, canonical stable id. */
export type TradeDisciplineId = Brand<string, 'TradeDisciplineId'>;

/** Stable id of one checklist item, review item or mistake tag. Default items use the L36.1 keys; new items get `createDisciplineListItemId()`. */
export type DisciplineListItemId = string;

/** The default checklist item ids (T-031a) and the only checklist keys of the legacy L36.1 shape. */
export const KAIROS_PRE_TRADE_CHECKLIST_KEYS = Object.freeze([
  'plan-written',
  'risk-defined',
  'stop-placed',
  'size-within-limit',
  'setup-matches-rules',
] as const);
export type PreTradeChecklistKey = (typeof KAIROS_PRE_TRADE_CHECKLIST_KEYS)[number];

/** The default review item ids (T-031a) and the only review keys of the legacy L36.1 shape. */
export const KAIROS_POST_TRADE_REVIEW_KEYS = Object.freeze([
  'followed-plan',
  'respected-stop',
  'exit-per-plan',
  'emotions-in-check',
] as const);
export type PostTradeReviewKey = (typeof KAIROS_POST_TRADE_REVIEW_KEYS)[number];

/** The default mistake item ids (T-031a) and the only mistake tags of the legacy L36.1 shape. */
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

export interface LegacyPreTradeChecklistAnswer {
  readonly key: PreTradeChecklistKey;
  readonly answer: DisciplineAnswer;
}

export interface LegacyPostTradeReviewAnswer {
  readonly key: PostTradeReviewKey;
  readonly answer: DisciplineAnswer;
}

/** Longest discipline note kept verbatim. */
export const KAIROS_DISCIPLINE_NOTE_MAX_LENGTH = 500 as const;

/** L36.1 shape. It exists only in format 5 and 6 backups and in v6/v7 databases; `upgradeLegacyTradeDisciplineRecord` converts it. */
export interface LegacyTradeDisciplineRecord {
  readonly id: TradeDisciplineId;
  readonly tradeId: TradeId;
  readonly preTradeChecklist: readonly LegacyPreTradeChecklistAnswer[];
  readonly postTradeReview: readonly LegacyPostTradeReviewAnswer[];
  readonly mistakes: readonly DisciplineMistakeTag[];
  readonly note: string;
  readonly checklistCompletedAt: string | null;
  readonly reviewedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** One checklist or review answer, stored by list item id with the item's label when the answer was saved. */
export interface DisciplineItemAnswer {
  readonly itemId: DisciplineListItemId;
  readonly label: string;
  readonly answer: DisciplineAnswer;
}

/** One marked mistake, stored by list item id with its label when it was saved. */
export interface DisciplineMistakeMark {
  readonly itemId: DisciplineListItemId;
  readonly label: string;
}

/** P28: stable id of a strategy or of one of its rules (the item-id pattern, disciplineLists.ts). */
export type StrategyId = string;
export type StrategyRuleId = string;

/**
 * P28: one rule of a strategy. Five kinds Kairos checks from data it owns
 * (the plan, the checklist, the symbol) and `written`, a rule the trader
 * ticks by hand. Typed data only: never an expression or code.
 */
export type StrategyRule =
  | Readonly<{ id: StrategyRuleId; kind: 'max-risk'; amount: DecimalString; currency: string }>
  | Readonly<{ id: StrategyRuleId; kind: 'min-reward-to-risk'; ratio: DecimalString }>
  | Readonly<{ id: StrategyRuleId; kind: 'stop-planned' }>
  | Readonly<{ id: StrategyRuleId; kind: 'checklist-complete' }>
  | Readonly<{ id: StrategyRuleId; kind: 'markets'; symbols: readonly string[] }>
  | Readonly<{ id: StrategyRuleId; kind: 'written'; label: string }>;
export type StrategyRuleKind = StrategyRule['kind'];

/** P28: the trader's own named plan. `revision` grows by one each time its name or rules change. */
export interface Strategy {
  readonly id: StrategyId;
  readonly name: string;
  readonly revision: number;
  readonly rules: readonly StrategyRule[];
}

/** The trader's tick on one written rule for one trade. */
export interface StrategyRuleAnswer {
  readonly ruleId: StrategyRuleId;
  readonly answer: DisciplineAnswer;
}

/**
 * P28: the strategy one trade follows, as it was when the trader chose it.
 * Its id, revision, name and rules are copied, so changing or deleting the
 * strategy later never changes how this trade is judged.
 */
export interface TradeStrategyMark {
  readonly strategyId: StrategyId;
  readonly revision: number;
  readonly name: string;
  readonly rules: readonly StrategyRule[];
  /** Ticks on the strategy's written rules; empty until the trader saves them. */
  readonly answers: readonly StrategyRuleAnswer[];
  /** When this strategy was chosen for the trade (UTC ISO). */
  readonly linkedAt: string;
}

/**
 * P22.2 trade discipline record: the trader's own answers about one trade.
 *
 * One record per trade (the database keeps `tradeId` unique, schema v8).
 * Answers are stored by list item id with the label as it was written, so they
 * stay readable after an item is renamed or removed. `checklistCompletedAt`
 * and `reviewedAt` are the moments the trader last answered each half, or
 * null when that half has not been answered. Never journal truth: nothing
 * about fills, sizing or outcomes lives here.
 */
export interface TradeDisciplineRecord {
  readonly id: TradeDisciplineId;
  readonly tradeId: TradeId;
  readonly preTradeChecklist: readonly DisciplineItemAnswer[];
  readonly postTradeReview: readonly DisciplineItemAnswer[];
  readonly mistakes: readonly DisciplineMistakeMark[];
  readonly note: string;
  readonly checklistCompletedAt: string | null;
  readonly reviewedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
