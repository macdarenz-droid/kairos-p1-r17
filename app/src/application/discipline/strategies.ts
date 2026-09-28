/**
 * P28: where the trader's strategies are stored, as one metadata record like the discipline lists (D35). Missing or damaged data reads as no strategies and is never rewritten here. Deleting a strategy never touches a trade: a trade keeps the rules it was judged by on its discipline record.
 */

import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { createKairosRepositories, type MetadataRepository } from '../../data/repositories';
import {
  createStrategyId,
  createStrategyRuleId,
  parseStrategies,
  type Strategy,
  type StrategyId,
  type StrategyInvalidReason,
  type StrategyRuleId,
} from '../../domain/discipline';
import { normalizeTradeSymbol } from '../trade-visualizer/tradePictureCandles';
import { isPriceCurrencyInput } from '../trades/priceCurrencyInput';

export const strategiesPreferenceMetadataKey = 'preferences.strategies.v1';

const NO_STRATEGIES: readonly Strategy[] = Object.freeze([]);

/** Reads the stored strategies; a missing record, bad JSON, another version or an invalid list read as none. Never writes. */
export async function readStrategies(metadata: MetadataRepository): Promise<readonly Strategy[]> {
  const stored = await metadata.get(strategiesPreferenceMetadataKey);
  if (!stored) return NO_STRATEGIES;
  try {
    const parsed: unknown = JSON.parse(stored.value);
    if (typeof parsed !== 'object' || parsed === null || (parsed as Record<string, unknown>).version !== 1) return NO_STRATEGIES;
    const result = parseStrategies((parsed as Record<string, unknown>).strategies);
    return result.ok ? result.strategies : NO_STRATEGIES;
  } catch {
    return NO_STRATEGIES;
  }
}

export type LoadStrategiesResult =
  | { readonly ok: true; readonly strategies: readonly Strategy[] }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'strategies-read-failed' };

export async function loadStrategies(db: KairosDatabase): Promise<LoadStrategiesResult> {
  try {
    return { ok: true, strategies: await readStrategies(createKairosRepositories(db).metadata) };
  } catch {
    return { ok: false, type: 'storage-error', reason: 'strategies-read-failed' };
  }
}

export type StrategyRuleDraft =
  | Readonly<{ id: StrategyRuleId; kind: 'max-risk'; amount: string; currency: string }>
  | Readonly<{ id: StrategyRuleId; kind: 'min-reward-to-risk'; ratio: string }>
  | Readonly<{ id: StrategyRuleId; kind: 'stop-planned' }>
  | Readonly<{ id: StrategyRuleId; kind: 'checklist-complete' }>
  /** Symbols as typed, separated by commas, spaces or new lines. */
  | Readonly<{ id: StrategyRuleId; kind: 'markets'; symbols: string }>
  | Readonly<{ id: StrategyRuleId; kind: 'written'; label: string }>;
export interface StrategyDraft { readonly id: StrategyId | null; readonly name: string; readonly rules: readonly StrategyRuleDraft[] }

/** A stored strategy as the editor holds it. */
export function strategyDraftFrom(strategy: Strategy): StrategyDraft {
  return {
    id: strategy.id,
    name: strategy.name,
    rules: strategy.rules.map((rule): StrategyRuleDraft => (rule.kind === 'markets' ? { id: rule.id, kind: 'markets', symbols: rule.symbols.join(', ') } : rule)),
  };
}

/** The one plain example to copy. No money rule: the trader's currency is not known. */
export function exampleStrategyDraft(): StrategyDraft {
  return {
    id: null,
    name: 'My first plan',
    rules: [
      { id: createStrategyRuleId(), kind: 'min-reward-to-risk', ratio: '2' },
      { id: createStrategyRuleId(), kind: 'stop-planned' },
      { id: createStrategyRuleId(), kind: 'checklist-complete' },
      { id: createStrategyRuleId(), kind: 'written', label: 'I only trade when I feel calm and rested' },
    ],
  };
}

export type SaveStrategyResult =
  | { readonly ok: true; readonly strategy: Strategy; readonly changed: boolean }
  | { readonly ok: false; readonly type: 'validation-error'; readonly reason: StrategyInvalidReason; readonly rule: number | null }
  | { readonly ok: false; readonly type: 'not-found'; readonly reason: 'strategy-not-found' }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'strategies-save-failed' };

/** One typed rule draft as the raw rule the domain parse checks, or the index of a bad currency. */
function ruleFromDraft(rule: StrategyRuleDraft): Record<string, unknown> | 'currency-invalid' {
  switch (rule.kind) {
    case 'max-risk': {
      const currency = rule.currency.trim().toUpperCase();
      if (currency === '' || !isPriceCurrencyInput(currency)) return 'currency-invalid';
      return { id: rule.id, kind: rule.kind, amount: rule.amount.trim(), currency };
    }
    case 'min-reward-to-risk':
      return { id: rule.id, kind: rule.kind, ratio: rule.ratio.trim() };
    case 'markets': {
      const symbols: string[] = [];
      for (const part of rule.symbols.split(/[\s,]+/)) {
        const symbol = normalizeTradeSymbol(part);
        if (symbol !== '' && !symbols.includes(symbol)) symbols.push(symbol);
      }
      return { id: rule.id, kind: rule.kind, symbols };
    }
    case 'written':
      return { id: rule.id, kind: rule.kind, label: rule.label };
    default:
      return { id: rule.id, kind: rule.kind };
  }
}

class StrategyNotFound extends Error {}

/** Adds or changes one strategy in one atomic metadata write; an unchanged strategy writes nothing. */
export async function saveStrategy(
  db: KairosDatabase,
  draft: StrategyDraft,
  dependencies: { readonly now?: () => string; readonly createId?: () => StrategyId } = {},
): Promise<SaveStrategyResult> {
  const rules: Record<string, unknown>[] = [];
  for (let index = 0; index < draft.rules.length; index += 1) {
    const rule = ruleFromDraft(draft.rules[index]!);
    if (rule === 'currency-invalid') return { ok: false, type: 'validation-error', reason: 'currency-invalid', rule: index };
    rules.push(rule);
  }
  const now = dependencies.now ?? (() => new Date().toISOString());
  const createId = dependencies.createId ?? createStrategyId;
  try {
    return await runKairosAtomicWrite(db, ['metadata'], async ({ repositories }): Promise<SaveStrategyResult> => {
      const current = await readStrategies(repositories.metadata);
      const next: unknown[] = [...current];
      let index: number;
      let stored: Strategy | null = null;
      if (draft.id === null) {
        index = next.length;
        next.push({ id: createId(), name: draft.name, revision: 1, rules });
      } else {
        index = current.findIndex(strategy => strategy.id === draft.id);
        if (index < 0) throw new StrategyNotFound();
        stored = current[index]!;
        next[index] = { id: stored.id, name: draft.name, revision: stored.revision + 1, rules };
      }
      const parsed = parseStrategies(next);
      if (!parsed.ok) return { ok: false, type: 'validation-error', reason: parsed.reason, rule: parsed.strategy === index ? parsed.rule : null };
      const candidate = parsed.strategies[index]!;
      if (stored !== null && JSON.stringify({ name: candidate.name, rules: candidate.rules }) === JSON.stringify({ name: stored.name, rules: stored.rules })) {
        return { ok: true, strategy: stored, changed: false };
      }
      await repositories.metadata.put({ key: strategiesPreferenceMetadataKey, value: JSON.stringify({ version: 1, strategies: parsed.strategies }), updatedAt: now() });
      return { ok: true, strategy: candidate, changed: true };
    });
  } catch (error) {
    if (error instanceof StrategyNotFound) return { ok: false, type: 'not-found', reason: 'strategy-not-found' };
    return { ok: false, type: 'storage-error', reason: 'strategies-save-failed' };
  }
}

export type DeleteStrategyResult =
  | { readonly ok: true; readonly strategies: readonly Strategy[] }
  | { readonly ok: false; readonly type: 'not-found'; readonly reason: 'strategy-not-found' }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'strategies-save-failed' };

/** Removes one strategy from the list. It reads and writes no trade and no discipline record. */
export async function deleteStrategy(db: KairosDatabase, strategyId: StrategyId, dependencies: { readonly now?: () => string } = {}): Promise<DeleteStrategyResult> {
  const now = dependencies.now ?? (() => new Date().toISOString());
  try {
    return await runKairosAtomicWrite(db, ['metadata'], async ({ repositories }): Promise<DeleteStrategyResult> => {
      const current = await readStrategies(repositories.metadata);
      if (!current.some(strategy => strategy.id === strategyId)) return { ok: false, type: 'not-found', reason: 'strategy-not-found' };
      const strategies = Object.freeze(current.filter(strategy => strategy.id !== strategyId));
      await repositories.metadata.put({ key: strategiesPreferenceMetadataKey, value: JSON.stringify({ version: 1, strategies }), updatedAt: now() });
      return { ok: true, strategies };
    });
  } catch {
    return { ok: false, type: 'storage-error', reason: 'strategies-save-failed' };
  }
}
