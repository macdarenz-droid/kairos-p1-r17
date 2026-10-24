/**
 * U14 (D258): the one owner of the trade you were typing. The trade form keeps it on this device while you type and
 * fills it back in when it opens again; a save clears it. Journal and Practice each have their own. It is this device's
 * own (`device.*`: never in a backup, kept by a restore). A record that fails any check is dropped, never half-used.
 */

import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import type { ManualTradeDraft } from './manualTradeDraft';
import type { ManualExecutionRow, ManualFeeRow } from './manualTradeExecutionDraft';
import type { QuickTradeLogDraft } from './quickTradeLog';

export type TradeFormDraftScope = 'journal' | 'practice';
export type TradeFormDraftMode = 'quick' | 'full';

/** Everything typed in the form: the trade, Quick log's three numbers, and All details' entry, exit and fee rows. */
export interface TradeFormDraft {
  readonly trade: ManualTradeDraft;
  readonly quick: QuickTradeLogDraft;
  readonly executions: readonly ManualExecutionRow[];
  readonly fees: readonly ManualFeeRow[];
}

export interface KeptTradeFormDraft {
  readonly savedAt: string;
  readonly mode: TradeFormDraftMode;
  readonly draft: TradeFormDraft;
}

export const tradeFormDraftKey = (scope: TradeFormDraftScope): string => `device.trade-form-draft.${scope}.v1`;

const wallClock = (): string => new Date().toISOString();

type Fields = Readonly<Record<string, unknown>>;
const isObject = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string';
const isInstant = (value: unknown): value is string => isText(value) && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
/** Exactly these keys: each required one present, each optional one absent or allowed, nothing else. */
function hasOnly(record: Fields, checks: Readonly<Record<string, (value: unknown) => boolean>>, optional: readonly string[] = []): boolean {
  for (const key of Object.keys(record)) if (!(key in checks)) return false;
  return Object.entries(checks).every(([key, check]) => (key in record ? check(record[key]) : optional.includes(key)));
}
const oneOf = (values: readonly string[]) => (value: unknown): boolean => isText(value) && values.includes(value);

const MARKET_TYPES = ['', 'stock', 'forex', 'crypto', 'futures', 'options', 'other'] as const;
const SIDES = ['', 'long', 'short'] as const;
const STATUSES = ['', 'draft', 'open', 'closed', 'cancelled'] as const;

const isPlan = (value: unknown): boolean => isObject(value)
  && hasOnly(value, { plannedEntryPrice: isText, plannedStopPrice: isText, plannedTargetPrice: isText, plannedQuantity: isText, reason: isText }, ['reason']);
const isTrade = (value: unknown): value is ManualTradeDraft => isObject(value) && hasOnly(value, {
  symbol: isText, marketType: oneOf(MARKET_TYPES), side: oneOf(SIDES), status: oneOf(STATUSES), openedAt: isText, closedAt: isText, plan: isPlan,
  priceCurrency: isText, contractSize: isText, exchange: isText, leverage: isText, tags: isText,
}, ['priceCurrency', 'contractSize', 'exchange', 'leverage', 'tags']);
const isQuick = (value: unknown): value is QuickTradeLogDraft => isObject(value) && hasOnly(value, { entryPrice: isText, exitPrice: isText, quantity: isText });
const isExecution = (value: unknown): boolean => isObject(value) && hasOnly(value, { key: isText, type: oneOf(['entry', 'exit']), price: isText, quantity: isText, executedAt: isText });
const isFee = (value: unknown): boolean => isObject(value) && hasOnly(value, { key: isText, amount: isText, currency: isText });
const rowsOf = (check: (value: unknown) => boolean) => (value: unknown): boolean => Array.isArray(value) && value.every(check);
const isDraft = (value: unknown): value is TradeFormDraft => isObject(value) && hasOnly(value, { trade: isTrade, quick: isQuick, executions: rowsOf(isExecution), fees: rowsOf(isFee) });

/** The record as stored, or null when any part of it fails. */
function parseKept(text: string): KeptTradeFormDraft | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isObject(parsed) || !hasOnly(parsed, { version: value => value === 1, savedAt: isInstant, mode: oneOf(['quick', 'full']), draft: isDraft })) return null;
    return Object.freeze({ savedAt: parsed.savedAt as string, mode: parsed.mode as TradeFormDraftMode, draft: parsed.draft as TradeFormDraft });
  } catch {
    return null;
  }
}

/**
 * Whether nothing is typed: every text blank and no entry, exit or fee row. The market alone does not count, because
 * the form fills it with the trader's first market (D223).
 */
export function isTradeFormDraftEmpty(draft: TradeFormDraft): boolean {
  const { marketType: _market, plan, ...trade } = draft.trade;
  const texts = [...Object.values(trade), ...Object.values(plan), ...Object.values(draft.quick)];
  return draft.executions.length === 0 && draft.fees.length === 0 && texts.every(value => typeof value !== 'string' || value.trim() === '');
}

async function removeRow(db: KairosDatabase, key: string): Promise<boolean> {
  try {
    await runKairosAtomicWrite(db, ['metadata'], async ({ repositories }) => { await repositories.metadata.delete(key); });
    return true;
  } catch {
    return false;
  }
}

/** The kept trade for this form, or null when there is none, it cannot be read, or it fails a check (then it is dropped). */
export async function readTradeFormDraft(db: KairosDatabase, scope: TradeFormDraftScope): Promise<KeptTradeFormDraft | null> {
  const key = tradeFormDraftKey(scope);
  let stored;
  try {
    stored = await createKairosRepositories(db).metadata.get(key);
  } catch {
    return null;
  }
  if (!stored) return null;
  const kept = parseKept(stored.value);
  if (kept === null) await removeRow(db, key);
  return kept;
}

/** Keeps what is typed, in one write; an empty form keeps nothing (the row goes). False when the device could not write. */
export async function keepTradeFormDraft(
  db: KairosDatabase, scope: TradeFormDraftScope, kept: Readonly<{ mode: TradeFormDraftMode; draft: TradeFormDraft }>, dependencies: { readonly now?: () => string } = {},
): Promise<boolean> {
  const key = tradeFormDraftKey(scope);
  if (isTradeFormDraftEmpty(kept.draft)) return removeRow(db, key);
  try {
    const savedAt = (dependencies.now ?? wallClock)();
    const value = JSON.stringify({ version: 1, savedAt, mode: kept.mode, draft: kept.draft });
    await runKairosAtomicWrite(db, ['metadata'], async ({ repositories }) => { await repositories.metadata.put({ key, value, updatedAt: savedAt }); });
    return true;
  } catch {
    return false;
  }
}

/** Forgets the kept trade (after a save, or "Start over"). */
export async function clearTradeFormDraft(db: KairosDatabase, scope: TradeFormDraftScope): Promise<boolean> {
  return removeRow(db, tradeFormDraftKey(scope));
}
