/**
 * P28 strategy contract: the rule kinds, their typed parameters, the limits and the validation of the stored list. Checks never live here; `application/discipline/strategyCheck.ts` owns them.
 */

import { isDisciplineListItemId, KAIROS_DISCIPLINE_LABEL_MAX_LENGTH } from './disciplineLists';
import type { Strategy, StrategyId, StrategyRule, StrategyRuleId, StrategyRuleKind } from './disciplineTypes';
import { parsePositiveDecimalString } from '../trades/tradeValidation';

export const KAIROS_STRATEGY_MAX_COUNT = 20;
export const KAIROS_STRATEGY_MAX_RULES = 12;
export const KAIROS_STRATEGY_NAME_MAX_LENGTH = 40;
export const KAIROS_STRATEGY_MAX_MARKETS = 20;
/** The rule kinds Kairos checks from data; at most one of each per strategy. Written rules may repeat. */
export const KAIROS_STRATEGY_CHECKED_RULE_KINDS = Object.freeze(['max-risk', 'min-reward-to-risk', 'stop-planned', 'checklist-complete', 'markets'] as const);
/** A market symbol as normalizeTradeSymbol writes it: capitals, digits and dots. */
export const KAIROS_STRATEGY_MARKET_PATTERN = /^[A-Z0-9.]{1,20}$/;

const RULE_KINDS: readonly StrategyRuleKind[] = Object.freeze([...KAIROS_STRATEGY_CHECKED_RULE_KINDS, 'written'] as const);

export function isStrategyName(value: unknown): value is string {
  return typeof value === 'string' && value.trim() === value && value.length >= 1 && value.length <= KAIROS_STRATEGY_NAME_MAX_LENGTH;
}

export function createStrategyId(): StrategyId {
  return crypto.randomUUID();
}

export function createStrategyRuleId(): StrategyRuleId {
  return crypto.randomUUID();
}

export type StrategyInvalidReason =
  | 'strategies-missing' | 'too-many-strategies' | 'invalid-strategy-id' | 'duplicate-strategy-id' | 'name-required' | 'name-too-long' | 'duplicate-name'
  | 'invalid-revision' | 'rules-required' | 'too-many-rules' | 'invalid-rule-id' | 'duplicate-rule-id' | 'unknown-rule-kind' | 'duplicate-rule-kind'
  | 'amount-invalid' | 'currency-invalid' | 'ratio-invalid' | 'markets-invalid' | 'label-required' | 'label-too-long';

export type ParseStrategyRulesResult =
  | { readonly ok: true; readonly rules: readonly StrategyRule[] }
  | { readonly ok: false; readonly reason: StrategyInvalidReason; readonly rule: number | null };
export type ParseStrategiesResult =
  | { readonly ok: true; readonly strategies: readonly Strategy[] }
  | { readonly ok: false; readonly reason: StrategyInvalidReason; readonly strategy: number | null; readonly rule: number | null };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A positive decimal written exactly as the kernel writes it (no spaces, no exponent), or null. */
function exactPositiveDecimal(value: unknown) {
  if (typeof value !== 'string') return null;
  const parsed = parsePositiveDecimalString(value);
  return parsed.ok && parsed.value === value ? parsed.value : null;
}

function isMarketList(value: unknown): value is readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > KAIROS_STRATEGY_MAX_MARKETS) return false;
  const seen = new Set<string>();
  for (const symbol of value) {
    if (typeof symbol !== 'string' || !KAIROS_STRATEGY_MARKET_PATTERN.test(symbol) || seen.has(symbol)) return false;
    seen.add(symbol);
  }
  return true;
}

export function parseStrategyRules(value: unknown): ParseStrategyRulesResult {
  const fail = (reason: StrategyInvalidReason, rule: number | null): ParseStrategyRulesResult => ({ ok: false, reason, rule });
  if (!Array.isArray(value) || value.length === 0) return fail('rules-required', null);
  if (value.length > KAIROS_STRATEGY_MAX_RULES) return fail('too-many-rules', null);
  const ids = new Set<string>();
  const checkedKinds = new Set<string>();
  const rules: StrategyRule[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const rule: unknown = value[index];
    if (!isPlainObject(rule) || !isDisciplineListItemId(rule.id)) return fail('invalid-rule-id', index);
    if (ids.has(rule.id)) return fail('duplicate-rule-id', index);
    ids.add(rule.id);
    const kind = rule.kind;
    if (typeof kind !== 'string' || !(RULE_KINDS as readonly string[]).includes(kind)) return fail('unknown-rule-kind', index);
    if (kind !== 'written') {
      if (checkedKinds.has(kind)) return fail('duplicate-rule-kind', index);
      checkedKinds.add(kind);
    }
    const id = rule.id;
    switch (kind as StrategyRuleKind) {
      case 'max-risk': {
        const amount = exactPositiveDecimal(rule.amount);
        if (amount === null) return fail('amount-invalid', index);
        const currency = rule.currency;
        if (typeof currency !== 'string' || currency === '' || currency !== currency.trim().toUpperCase()) return fail('currency-invalid', index);
        rules.push(Object.freeze({ id, kind: 'max-risk' as const, amount, currency }));
        break;
      }
      case 'min-reward-to-risk': {
        const ratio = exactPositiveDecimal(rule.ratio);
        if (ratio === null) return fail('ratio-invalid', index);
        rules.push(Object.freeze({ id, kind: 'min-reward-to-risk' as const, ratio }));
        break;
      }
      case 'stop-planned':
      case 'checklist-complete':
        rules.push(Object.freeze({ id, kind: kind as 'stop-planned' | 'checklist-complete' }));
        break;
      case 'markets': {
        if (!isMarketList(rule.symbols)) return fail('markets-invalid', index);
        rules.push(Object.freeze({ id, kind: 'markets' as const, symbols: Object.freeze([...rule.symbols]) }));
        break;
      }
      case 'written': {
        const label = typeof rule.label === 'string' ? rule.label.trim() : '';
        if (label === '') return fail('label-required', index);
        if (label.length > KAIROS_DISCIPLINE_LABEL_MAX_LENGTH) return fail('label-too-long', index);
        rules.push(Object.freeze({ id, kind: 'written' as const, label }));
        break;
      }
    }
  }
  return { ok: true, rules: Object.freeze(rules) };
}

export function parseStrategies(value: unknown): ParseStrategiesResult {
  const fail = (reason: StrategyInvalidReason, strategy: number | null, rule: number | null = null): ParseStrategiesResult => ({ ok: false, reason, strategy, rule });
  if (!Array.isArray(value)) return fail('strategies-missing', null);
  if (value.length > KAIROS_STRATEGY_MAX_COUNT) return fail('too-many-strategies', null);
  const ids = new Set<string>();
  const names = new Set<string>();
  const strategies: Strategy[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const strategy: unknown = value[index];
    if (!isPlainObject(strategy) || !isDisciplineListItemId(strategy.id)) return fail('invalid-strategy-id', index);
    if (ids.has(strategy.id)) return fail('duplicate-strategy-id', index);
    ids.add(strategy.id);
    const name = typeof strategy.name === 'string' ? strategy.name.trim() : '';
    if (name === '') return fail('name-required', index);
    if (name.length > KAIROS_STRATEGY_NAME_MAX_LENGTH) return fail('name-too-long', index);
    const key = name.toLowerCase();
    if (names.has(key)) return fail('duplicate-name', index);
    names.add(key);
    const revision = strategy.revision;
    if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) return fail('invalid-revision', index);
    const rules = parseStrategyRules(strategy.rules);
    if (!rules.ok) return fail(rules.reason, index, rules.rule);
    strategies.push(Object.freeze({ id: strategy.id, name, revision, rules: rules.rules }));
  }
  return { ok: true, strategies: Object.freeze(strategies) };
}
