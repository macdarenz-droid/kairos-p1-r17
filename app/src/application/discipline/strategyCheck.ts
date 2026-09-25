/**
 * P28: the one owner of a strategy rule check. It judges the trade's plan (planned entry, stop, target, quantity), its symbol, its checklist and the trader's ticks, never its entries and exits. Every number comes from its owner. Missing data gives 'unknown', never 'kept' or 'broken'. It never blocks a save.
 */

import { decimalCompare, decimalRound, decimalScaleToSteps } from '../../domain/calculations/decimalKernel';
import { calculateInitialRiskAmount, calculateRiskPriceDistance } from '../../domain/calculations/riskCalculator';
import type { Strategy, StrategyRule, StrategyRuleAnswer, StrategyRuleId, TradeDisciplineRecord } from '../../domain/discipline';
import { parsePositiveDecimalString, type DecimalString, type TradePlanRecord, type TradeRecord, type TradeSide, type TradeStatus } from '../../domain/trades';
import { projectPlannedRewardToRisk } from '../risk-reward/plannedRewardToRisk';
import { TRADE_PICTURE_RATIO_PLACES } from '../trade-visualizer/tradePicture';
import { normalizeTradeSymbol } from '../trade-visualizer/tradePictureCandles';
import { latestTradePlan } from '../trade-visualizer/tradeVisualizerFacts';
import { isPriceCurrencyInput } from '../trades/priceCurrencyInput';
import type { ManualTradeDraft } from '../trades/manualTradeDraft';
import { summarizeTradeChecklist, type TradeChecklistSummary } from './tradeDisciplineSummary';

export const STRATEGY_RULE_BAR_STEPS = 10;
export type StrategyRuleVerdict = 'kept' | 'broken' | 'unknown';
/** Two bar lengths for drawing only, out of STRATEGY_RULE_BAR_STEPS; the larger value is the full bar. */
export interface StrategyRuleBars { readonly firstSteps: number; readonly secondSteps: number }
export interface TradeStrategyCheckInput {
  readonly rules: readonly StrategyRule[];
  readonly answers: readonly StrategyRuleAnswer[];
  /** As saved or typed; '' when not typed yet. */
  readonly symbol: string;
  readonly side: TradeSide | null;
  readonly status: TradeStatus | null;
  /** The trade's price currency (grossPnlCurrency); null when not recorded. */
  readonly priceCurrency: string | null;
  readonly plan: Readonly<{ entry: DecimalString | null; stop: DecimalString | null; target: DecimalString | null; quantity: DecimalString | null }>;
  /** From summarizeTradeChecklist; null when no checklist is saved. */
  readonly checklist: TradeChecklistSummary | null;
}
export type StrategyRuleResult =
  | Readonly<{ kind: 'max-risk'; ruleId: StrategyRuleId; verdict: StrategyRuleVerdict; reason: 'within' | 'over' | 'plan-incomplete' | 'no-currency' | 'other-currency'; risk: DecimalString | null; limit: DecimalString; currency: string; tradeCurrency: string | null; bars: StrategyRuleBars | null }>
  | Readonly<{ kind: 'min-reward-to-risk'; ruleId: StrategyRuleId; verdict: StrategyRuleVerdict; reason: 'at-least' | 'below' | 'plan-incomplete' | 'levels-not-ordered'; ratio: DecimalString | null; shownRatio: DecimalString | null; least: DecimalString; bars: StrategyRuleBars | null }>
  | Readonly<{ kind: 'stop-planned'; ruleId: StrategyRuleId; verdict: StrategyRuleVerdict; reason: 'planned' | 'no-stop'; stop: DecimalString | null }>
  | Readonly<{ kind: 'checklist-complete'; ruleId: StrategyRuleId; verdict: StrategyRuleVerdict; reason: 'every-step' | 'steps-missed' | 'no-checklist' | 'cancelled' | 'not-yet'; ticked: number | null; asked: number | null }>
  | Readonly<{ kind: 'markets'; ruleId: StrategyRuleId; verdict: StrategyRuleVerdict; reason: 'listed' | 'not-listed' | 'no-market'; symbol: string | null; symbols: readonly string[] }>
  | Readonly<{ kind: 'written'; ruleId: StrategyRuleId; verdict: StrategyRuleVerdict; reason: 'said-yes' | 'said-no' | 'not-answered'; label: string }>;
export interface TradeStrategyCheck {
  /** One result per rule, in the rules' order. */
  readonly results: readonly StrategyRuleResult[];
  readonly kept: number;
  readonly broken: number;
  readonly unknown: number;
  /** results.length */
  readonly total: number;
}

/** Two bar lengths out of STRATEGY_RULE_BAR_STEPS, the larger value full; null when either is not a decimal. */
export function projectStrategyRuleBars(first: DecimalString | string, second: DecimalString | string): StrategyRuleBars | null {
  const order = decimalCompare(first, second);
  if (order === null) return null;
  const firstSteps = order >= 0 ? STRATEGY_RULE_BAR_STEPS : decimalScaleToSteps(first, second, STRATEGY_RULE_BAR_STEPS);
  const secondSteps = order >= 0 ? decimalScaleToSteps(second, first, STRATEGY_RULE_BAR_STEPS) : STRATEGY_RULE_BAR_STEPS;
  if (firstSteps === null || secondSteps === null) return null;
  return Object.freeze({ firstSteps, secondSteps });
}

function checkRule(rule: StrategyRule, input: TradeStrategyCheckInput): StrategyRuleResult {
  const { entry, stop, target, quantity } = input.plan;
  switch (rule.kind) {
    case 'max-risk': {
      const base = { kind: 'max-risk' as const, ruleId: rule.id, limit: rule.amount, currency: rule.currency, tradeCurrency: input.priceCurrency };
      const unknown = (reason: 'plan-incomplete' | 'no-currency' | 'other-currency', risk: DecimalString | null) => ({ ...base, verdict: 'unknown' as const, reason, risk, bars: null });
      if (entry === null || stop === null || quantity === null) return unknown('plan-incomplete', null);
      const distance = calculateRiskPriceDistance(entry, stop);
      const amount = distance.ok ? calculateInitialRiskAmount(distance.value, quantity) : null;
      if (amount === null || !amount.ok) return unknown('plan-incomplete', null);
      const risk = amount.value;
      if (input.priceCurrency === null) return unknown('no-currency', risk);
      if (input.priceCurrency !== rule.currency) return unknown('other-currency', risk);
      const order = decimalCompare(risk, rule.amount);
      if (order === null) return unknown('plan-incomplete', risk);
      return { ...base, verdict: order <= 0 ? 'kept' : 'broken', reason: order <= 0 ? 'within' : 'over', risk, bars: projectStrategyRuleBars(risk, rule.amount) };
    }
    case 'min-reward-to-risk': {
      const base = { kind: 'min-reward-to-risk' as const, ruleId: rule.id, least: rule.ratio };
      const unknown = (reason: 'plan-incomplete' | 'levels-not-ordered') => ({ ...base, verdict: 'unknown' as const, reason, ratio: null, shownRatio: null, bars: null });
      if (input.side === null || entry === null || stop === null || target === null) return unknown('plan-incomplete');
      const planned = projectPlannedRewardToRisk(input.side, entry, stop, target);
      if (!planned.ok) return unknown('levels-not-ordered');
      const ratio = planned.value.ratio;
      const shown = decimalRound(ratio, TRADE_PICTURE_RATIO_PLACES, 'half-up');
      const order = decimalCompare(ratio, rule.ratio);
      if (order === null) return unknown('levels-not-ordered');
      return { ...base, verdict: order >= 0 ? 'kept' : 'broken', reason: order >= 0 ? 'at-least' : 'below', ratio, shownRatio: shown.ok ? shown.value : null, bars: projectStrategyRuleBars(ratio, rule.ratio) };
    }
    case 'stop-planned':
      return stop !== null
        ? { kind: 'stop-planned', ruleId: rule.id, verdict: 'kept', reason: 'planned', stop }
        : { kind: 'stop-planned', ruleId: rule.id, verdict: 'broken', reason: 'no-stop', stop: null };
    case 'checklist-complete': {
      const summary = input.checklist;
      if (summary?.complete) return { kind: 'checklist-complete', ruleId: rule.id, verdict: 'kept', reason: 'every-step', ticked: summary.ticked, asked: summary.asked };
      if (summary) return { kind: 'checklist-complete', ruleId: rule.id, verdict: 'broken', reason: 'steps-missed', ticked: summary.ticked, asked: summary.asked };
      // A missing checklist is never broken: it is unknown, like the discipline score (D32, D33).
      const reason = input.status === 'closed' ? 'no-checklist' : input.status === 'cancelled' ? 'cancelled' : 'not-yet';
      return { kind: 'checklist-complete', ruleId: rule.id, verdict: 'unknown', reason, ticked: null, asked: null };
    }
    case 'markets': {
      const symbol = normalizeTradeSymbol(input.symbol);
      const symbols = Object.freeze([...rule.symbols]);
      if (symbol === '') return { kind: 'markets', ruleId: rule.id, verdict: 'unknown', reason: 'no-market', symbol: null, symbols };
      const listed = symbols.includes(symbol);
      return { kind: 'markets', ruleId: rule.id, verdict: listed ? 'kept' : 'broken', reason: listed ? 'listed' : 'not-listed', symbol, symbols };
    }
    case 'written': {
      const answer = input.answers.find(item => item.ruleId === rule.id)?.answer;
      if (answer === 'yes') return { kind: 'written', ruleId: rule.id, verdict: 'kept', reason: 'said-yes', label: rule.label };
      if (answer === 'no') return { kind: 'written', ruleId: rule.id, verdict: 'broken', reason: 'said-no', label: rule.label };
      return { kind: 'written', ruleId: rule.id, verdict: 'unknown', reason: 'not-answered', label: rule.label };
    }
  }
}

/** Kept, broken or unknown for each rule of one trade, with the counts. */
export function checkTradeStrategy(input: TradeStrategyCheckInput): TradeStrategyCheck {
  const results = input.rules.map(rule => Object.freeze(checkRule(rule, input)));
  const count = (verdict: StrategyRuleVerdict) => results.filter(result => result.verdict === verdict).length;
  return Object.freeze({ results: Object.freeze(results), kept: count('kept'), broken: count('broken'), unknown: count('unknown'), total: results.length });
}

/** The check of a saved trade against the strategy it names; null when it names none. */
export function checkSavedTradeStrategy(trade: TradeRecord, plans: readonly TradePlanRecord[], record: TradeDisciplineRecord | null): TradeStrategyCheck | null {
  const mark = record?.strategy;
  if (mark === undefined) return null;
  const plan = latestTradePlan(plans);
  return checkTradeStrategy({
    rules: mark.rules,
    answers: mark.answers,
    symbol: trade.symbol,
    side: trade.side,
    status: trade.status,
    priceCurrency: trade.grossPnlCurrency ?? null,
    plan: {
      entry: plan?.plannedEntryPrice ?? null,
      stop: plan?.plannedStopPrice ?? null,
      target: plan?.plannedTargetPrice ?? null,
      quantity: plan?.plannedQuantity ?? null,
    },
    checklist: summarizeTradeChecklist(record),
  });
}

const typedDecimal = (value: string): DecimalString | null => {
  if (value.trim() === '') return null;
  const parsed = parsePositiveDecimalString(value);
  return parsed.ok ? parsed.value : null;
};

/** The check of the trade form as typed, before saving, against one strategy. */
export function previewTradeStrategyCheck(draft: ManualTradeDraft, status: TradeStatus | '', strategy: Strategy): TradeStrategyCheck {
  const currency = (draft.priceCurrency ?? '').trim().toUpperCase();
  return checkTradeStrategy({
    rules: strategy.rules,
    answers: [],
    symbol: draft.symbol,
    side: draft.side || null,
    status: status || null,
    priceCurrency: currency !== '' && isPriceCurrencyInput(currency) ? currency : null,
    plan: {
      entry: typedDecimal(draft.plan.plannedEntryPrice),
      stop: typedDecimal(draft.plan.plannedStopPrice),
      target: typedDecimal(draft.plan.plannedTargetPrice),
      quantity: typedDecimal(draft.plan.plannedQuantity),
    },
    checklist: null,
  });
}
