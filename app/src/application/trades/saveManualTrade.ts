import { isPriceCurrencyInput } from './priceCurrencyInput';
import type { KairosDatabase } from '../../data/database/KairosDatabase';
import { runKairosAtomicWrite } from '../../data/database/transactions';
import {
  createTradeDomainId,
  parsePositiveDecimalString,
  validateTradeRecord,
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
}

export type ManualTradeValidationField =
  | 'grossPnlCurrency'
  | 'symbol'
  | 'trade'
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
  const timestamp = now();
  const tradeId = createId<TradeId>();
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
  };

  const tradeValidation = validateTradeRecord(trade);
  if (!tradeValidation.ok) {
    return validationFailure(tradeValidation.reason === 'symbol-required' ? 'symbol' : 'trade', tradeValidation.reason);
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

    plan = {
      id: createId<TradePlanId>(),
      tradeId,
      plannedEntryPrice: entry.value,
      plannedStopPrice: stop.value,
      plannedTargetPrice: target.value,
      plannedQuantity: quantity.value,
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

  const stores = ['trades'] as const;
  const storeNames = [
    ...stores,
    ...(prepared.plan ? (['tradePlans'] as const) : []),
    ...(prepared.executions.length ? (['tradeExecutions'] as const) : []),
    ...(prepared.fees.length ? (['tradeFees'] as const) : []),
  ];

  try {
    await runKairosAtomicWrite(db, storeNames, async ({ repositories }) => {
      await repositories.trades.put(prepared.trade);
      if (prepared.plan) await repositories.tradePlans.put(prepared.plan);
      for (const execution of prepared.executions) await repositories.tradeExecutions.put(execution);
      for (const fee of prepared.fees) await repositories.tradeFees.put(fee);
    });
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
