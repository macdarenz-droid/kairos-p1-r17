import { isPriceCurrencyInput } from './priceCurrencyInput';
import { readDisciplineLists } from '../discipline/disciplineListsPreference';
import { readStrategies } from '../discipline/strategies';
import { buildTradeDisciplineRecord, emptyTradeDisciplineRecord, type TradeDisciplineParts } from '../discipline/tradeDiscipline';
import { KAIROS_DEFAULT_DISCIPLINE_LISTS, createTradeDisciplineId, validateTradeDisciplineRecord, type TradeDisciplineId } from '../../domain/discipline';
import type { KairosDatabase } from '../../data/database/KairosDatabase';
import { runKairosAtomicWrite } from '../../data/database/transactions';
import {
  createTradeDomainId,
  normalizeTradeTags,
  parsePositiveDecimalString,
  validateTradePlanFields,
  validateTradeRecord,
  writeTradeExchange,
  type DecimalString,
  type MarketType,
  type TradeExecutionId,
  type TradeExecutionRecord,
  type TradeExecutionType,
  type TradeFeeId,
  type TradeFeeRecord,
  type TradeId,
  type TradePlanId,
  type TradePlanRecord,
  type TradeRecord,
  type TradeSide,
  type TradeStatus,
} from '../../domain/trades';

export interface ManualTradePlanInput {
  readonly plannedEntryPrice?: string | null;
  readonly plannedStopPrice?: string | null;
  readonly plannedTargetPrice?: string | null;
  readonly plannedQuantity?: string | null;
  /** "Why I'm taking it" (U11, D240); empty means none. */
  readonly reason?: string | null;
}

export interface ManualTradeExecutionInput {
  readonly type: TradeExecutionType;
  readonly price: string;
  readonly quantity: string;
  readonly executedAt: string;
}

export interface ManualTradeFeeInput {
  readonly amount: string;
  readonly currency: string;
}

export interface SaveManualTradeInput {
  readonly grossPnlCurrency?: string | null;
  readonly symbol: string;
  readonly marketType: MarketType;
  readonly side: TradeSide;
  readonly status: TradeStatus;
  readonly openedAt?: string | null;
  readonly closedAt?: string | null;
  readonly plan?: ManualTradePlanInput | null;
  readonly executions?: readonly ManualTradeExecutionInput[];
  readonly fees?: readonly ManualTradeFeeInput[];
  /** U11 (D237–D240): how much one point is worth, where it was traded, tags (written one way here) and leverage. Empty means none. */
  readonly contractSize?: string | null;
  readonly exchange?: string | null;
  readonly tags?: readonly string[] | null;
  readonly leverage?: string | null;
  /**
   * U12 (D241): what was ticked before the trade (its checklist, the strategy and its written-rule ticks) and what "Before
   * you save" named, saved with the trade in the same write. A checklist needs a draft or open trade, or a replay trade.
   */
  readonly discipline?: TradeDisciplineParts;
}

export type ManualTradeValidationField =
  | 'grossPnlCurrency'
  | 'symbol'
  | 'trade'
  | 'contractSize'
  | 'exchange'
  | 'tags'
  | 'leverage'
  /** U15 (D265): the trade's note (Edit and the trade page's Notes). */
  | 'note'
  | 'discipline.checklist'
  | 'discipline.strategy'
  | 'discipline.beforeSave'
  | 'plan.reason'
  | 'plan.plannedEntryPrice'
  | 'plan.plannedStopPrice'
  | 'plan.plannedTargetPrice'
  | 'plan.plannedQuantity'
  | `executions.${number}.price`
  | `executions.${number}.quantity`
  | `executions.${number}.executedAt`
  | `fees.${number}.amount`
  | `fees.${number}.currency`;

export type SaveManualTradeResult =
  | {
      readonly ok: true;
      readonly tradeId: TradeId;
      readonly persisted: Readonly<{
        plans: number;
        executions: number;
        fees: number;
      }>;
    }
  | {
      readonly ok: false;
      readonly type: 'validation-error';
      readonly field: ManualTradeValidationField;
      readonly reason: string;
    }
  | {
      readonly ok: false;
      readonly type: 'storage-error';
      readonly reason: 'trade-save-failed';
    };

export interface SaveManualTradeDependencies {
  readonly now?: () => string;
  readonly createId?: <T extends TradeId | TradePlanId | TradeExecutionId | TradeFeeId>() => T;
  readonly createDisciplineId?: () => TradeDisciplineId;
}

type ValidationFailure = Extract<SaveManualTradeResult, { type: 'validation-error' }>;

type PreparedManualTrade = Readonly<{
  trade: TradeRecord;
  plan: TradePlanRecord | null;
  executions: readonly TradeExecutionRecord[];
  fees: readonly TradeFeeRecord[];
}>;

function validationFailure(field: ManualTradeValidationField, reason: string): ValidationFailure {
  return { ok: false, type: 'validation-error', field, reason };
}

function optionalPositiveDecimal(
  raw: string | null | undefined,
  field: ManualTradeValidationField,
): { readonly ok: true; readonly value: DecimalString | null } | ValidationFailure {
  if (raw === null || raw === undefined || raw.trim() === '') {
    return { ok: true, value: null };
  }
  const parsed = parsePositiveDecimalString(raw);
  if (!parsed.ok) return validationFailure(field, parsed.reason);
  return { ok: true, value: parsed.value };
}

function requiredPositiveDecimal(
  raw: string,
  field: ManualTradeValidationField,
): { readonly ok: true; readonly value: DecimalString } | ValidationFailure {
  const parsed = parsePositiveDecimalString(raw);
  if (!parsed.ok) return validationFailure(field, parsed.reason);
  return { ok: true, value: parsed.value };
}

/** Which form field a trade record's refusal points at. */
export const TRADE_FIELD_OF: Readonly<Partial<Record<string, ManualTradeValidationField>>> = Object.freeze({
  'symbol-required': 'symbol',
  'invalid-contract-size': 'contractSize',
  'invalid-exchange': 'exchange',
  'invalid-tags': 'tags',
  'invalid-leverage': 'leverage',
  'invalid-note': 'note',
});

export function isIsoLikeTimestamp(value: string): boolean {
  return value.trim() !== '' && Number.isFinite(Date.parse(value));
}

export function prepareManualTrade(
  input: SaveManualTradeInput,
  now: () => string,
  createId: NonNullable<SaveManualTradeDependencies['createId']>,
): PreparedManualTrade | ValidationFailure {
  if (input.grossPnlCurrency != null && typeof input.grossPnlCurrency !== 'string') {
    return validationFailure('grossPnlCurrency', 'invalid-pnl-currency');
  }
  const grossPnlCurrency = input.grossPnlCurrency?.trim().toUpperCase() || null;
  if (grossPnlCurrency && !isPriceCurrencyInput(grossPnlCurrency)) {
    return validationFailure('grossPnlCurrency', 'invalid-pnl-currency');
  }
  const contractSize = optionalPositiveDecimal(input.contractSize, 'contractSize');
  if (!contractSize.ok) return contractSize;
  const leverage = optionalPositiveDecimal(input.leverage, 'leverage');
  if (!leverage.ok) return leverage;
  const tags = normalizeTradeTags(input.tags ?? []);
  if (!tags.ok) return validationFailure('tags', tags.reason);
  const exchange = writeTradeExchange(input.exchange ?? '') || null;
  const timestamp = now();
  const tradeId = createId<TradeId>();
  // An empty field stays absent, never stored as null or [] (restore verification compares records exactly).
  const trade: TradeRecord = {
    id: tradeId,
    symbol: input.symbol.trim().toUpperCase(),
    marketType: input.marketType,
    side: input.side,
    status: input.status,
    source: 'manual',
    ...(grossPnlCurrency ? { grossPnlCurrency } : {}),
    openedAt: input.openedAt?.trim() || null,
    closedAt: input.closedAt?.trim() || null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(contractSize.value ? { contractSize: contractSize.value } : {}),
    ...(exchange ? { exchange } : {}),
    ...(tags.tags.length > 0 ? { tags: tags.tags } : {}),
    ...(leverage.value ? { leverage: leverage.value } : {}),
  };

  const tradeValidation = validateTradeRecord(trade);
  if (!tradeValidation.ok) {
    return validationFailure(TRADE_FIELD_OF[tradeValidation.reason] ?? 'trade', tradeValidation.reason);
  }

  let plan: TradePlanRecord | null = null;
  if (input.plan) {
    const entry = optionalPositiveDecimal(input.plan.plannedEntryPrice, 'plan.plannedEntryPrice');
    if (!entry.ok) return entry;
    const stop = optionalPositiveDecimal(input.plan.plannedStopPrice, 'plan.plannedStopPrice');
    if (!stop.ok) return stop;
    const target = optionalPositiveDecimal(input.plan.plannedTargetPrice, 'plan.plannedTargetPrice');
    if (!target.ok) return target;
    const quantity = optionalPositiveDecimal(input.plan.plannedQuantity, 'plan.plannedQuantity');
    if (!quantity.ok) return quantity;
    const reason = input.plan.reason?.trim() || null;
    if (reason !== null && !validateTradePlanFields({ reason }).ok) return validationFailure('plan.reason', 'invalid-plan-reason');

    plan = {
      id: createId<TradePlanId>(),
      tradeId,
      plannedEntryPrice: entry.value,
      plannedStopPrice: stop.value,
      plannedTargetPrice: target.value,
      plannedQuantity: quantity.value,
      ...(reason !== null ? { reason } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  const executions: TradeExecutionRecord[] = [];
  for (const [index, executionInput] of (input.executions ?? []).entries()) {
    const price = requiredPositiveDecimal(executionInput.price, `executions.${index}.price`);
    if (!price.ok) return price;
    const quantity = requiredPositiveDecimal(executionInput.quantity, `executions.${index}.quantity`);
    if (!quantity.ok) return quantity;
    if (!isIsoLikeTimestamp(executionInput.executedAt)) {
      return validationFailure(`executions.${index}.executedAt`, 'timestamp-required');
    }
    executions.push({
      id: createId<TradeExecutionId>(),
      tradeId,
      type: executionInput.type,
      price: price.value,
      quantity: quantity.value,
      executedAt: executionInput.executedAt.trim(),
      createdAt: timestamp,
    });
  }

  const fees: TradeFeeRecord[] = [];
  for (const [index, feeInput] of (input.fees ?? []).entries()) {
    const amount = requiredPositiveDecimal(feeInput.amount, `fees.${index}.amount`);
    if (!amount.ok) return amount;
    const currency = feeInput.currency.trim().toUpperCase();
    if (!currency) return validationFailure(`fees.${index}.currency`, 'currency-required');
    fees.push({
      id: createId<TradeFeeId>(),
      tradeId,
      executionId: null,
      amount: amount.value,
      currency,
      createdAt: timestamp,
    });
  }

  return Object.freeze({ trade, plan, executions, fees });
}

export async function saveManualTrade(
  db: KairosDatabase,
  input: SaveManualTradeInput,
  dependencies: SaveManualTradeDependencies = {},
): Promise<SaveManualTradeResult> {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const createId = dependencies.createId ?? createTradeDomainId;
  const prepared = prepareManualTrade(input, now, createId);
  if ('ok' in prepared) return prepared;

  try {
    const written = await writePreparedTrade(db, prepared, input.discipline, dependencies.createDisciplineId ?? createTradeDisciplineId);
    if (written !== null) return written;
  } catch {
    return { ok: false, type: 'storage-error', reason: 'trade-save-failed' };
  }

  return {
    ok: true,
    tradeId: prepared.trade.id,
    persisted: Object.freeze({
      plans: prepared.plan ? 1 : 0,
      executions: prepared.executions.length,
      fees: prepared.fees.length,
    }),
  };
}

/** Parts that say nothing are left out: an empty checklist, no strategy, a box that named nothing. */
function meaningfulParts(parts: TradeDisciplineParts | undefined): TradeDisciplineParts | null {
  if (!parts) return null;
  const kept: TradeDisciplineParts = {
    ...(parts.checklist && parts.checklist.length > 0 ? { checklist: parts.checklist } : {}),
    ...(parts.strategy && parts.strategy.strategyId !== null ? { strategy: parts.strategy } : {}),
    ...(parts.beforeSave && parts.beforeSave.notes.length > 0 ? { beforeSave: parts.beforeSave } : {}),
  };
  return Object.keys(kept).length > 0 ? kept : null;
}

/**
 * The one write of a prepared trade (Journal and Practice): the trade, its plan, fills and fees and, U12 (D241), its
 * discipline record built from what was ticked before it, all in one atomic write. A refused part saves nothing and is
 * returned as a validation failure naming it; null means saved. Storage failures throw for the caller to word.
 */
export async function writePreparedTrade(
  db: KairosDatabase,
  prepared: PreparedManualTrade,
  discipline: TradeDisciplineParts | undefined,
  createDisciplineId: () => TradeDisciplineId,
): Promise<ValidationFailure | null> {
  const parts = meaningfulParts(discipline);
  const { trade } = prepared;
  // A checklist answered after the trade closed would be hindsight; a replay's list is ticked at its plan step (D241).
  if (parts?.checklist && trade.status !== 'draft' && trade.status !== 'open' && trade.source !== 'replay') {
    return validationFailure('discipline.checklist', 'trade-status-not-allowed');
  }
  const storeNames = [
    'trades' as const,
    ...(prepared.plan ? (['tradePlans'] as const) : []),
    ...(prepared.executions.length ? (['tradeExecutions'] as const) : []),
    ...(prepared.fees.length ? (['tradeFees'] as const) : []),
    ...(parts ? (['metadata', 'tradeDiscipline'] as const) : []),
  ];
  return runKairosAtomicWrite(db, storeNames, async ({ repositories }): Promise<ValidationFailure | null> => {
    let record = null;
    if (parts) {
      // Read directly in this write (see saveTradeDiscipline), then build before anything is written.
      const lists = parts.checklist ? await readDisciplineLists(repositories.metadata) : KAIROS_DEFAULT_DISCIPLINE_LISTS;
      const strategies = parts.strategy ? await readStrategies(repositories.metadata) : [];
      const built = buildTradeDisciplineRecord(emptyTradeDisciplineRecord(createDisciplineId(), trade.id, trade.createdAt), null, parts, trade.createdAt, { lists, strategies });
      if (!built.ok) return validationFailure(`discipline.${built.failure.part}`, built.failure.reason);
      if (!validateTradeDisciplineRecord(built.record).ok) throw new Error('invalid-discipline-record');
      record = built.record;
    }
    await repositories.trades.put(trade);
    if (prepared.plan) await repositories.tradePlans.put(prepared.plan);
    for (const execution of prepared.executions) await repositories.tradeExecutions.put(execution);
    for (const fee of prepared.fees) await repositories.tradeFees.put(fee);
    if (record) await repositories.tradeDiscipline.put(record);
    return null;
  });
}
