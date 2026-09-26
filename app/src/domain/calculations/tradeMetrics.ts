import type {
  DecimalString,
  TradeExecutionRecord,
  TradeFeeRecord,
  TradeSide,
} from '../trades';
import { assessExecutionBalance } from './executionBalance';
import { calculateFlatTradeGrossRealizedPnl } from './grossRealizedPnl';
import { calculateRiskPerformance } from './riskPerformanceCalculator';
import { calculateTotalFees } from './feeCalculator';
import { calculateComparableNetPnl } from './netPnlComposition';
import { calculatePercentage } from './percentageCalculator';
import { calculateRMultiple } from './rMultipleCalculator';

export type TradeMetricsState =
  | 'unrealized'
  | 'partially-realized'
  | 'realized';

export interface TradeMetricsCompleteness {
  readonly hasEntryExecutions: boolean;
  readonly hasExitExecutions: boolean;
  readonly hasAverageEntryPrice: boolean;
  readonly hasAverageExitPrice: boolean;
  readonly hasGrossPnl: boolean;
  readonly hasTotalFees: boolean;
  readonly hasNetPnl: boolean;
  readonly hasPnlPercent: boolean;
  readonly hasInitialRisk: boolean;
  readonly hasRealizedR: boolean;
}

export interface TradeMetricsNetPnlCurrencyInput {
  readonly grossPnlCurrency: string | null;
}

export interface TradeMetricsPnlPercentageInput {
  readonly resultAmount: DecimalString;
  readonly basisAmount: DecimalString;
}

export interface TradeMetricsRMultipleInput {
  readonly resultAmount: DecimalString;
  readonly initialRiskAmount: DecimalString;
}

export interface TradeMetricsRiskPerformanceInput {
  readonly resultAmount: DecimalString;
  readonly riskPerUnit: DecimalString;
  readonly quantity: DecimalString;
}

export interface TradeMetrics {
  readonly grossPnl: DecimalString | null;
  readonly totalFees: DecimalString | null;
  readonly totalFeesCurrency: string | null;
  readonly netPnl: DecimalString | null;
  readonly netPnlCurrency: string | null;
  readonly pnlPercent: DecimalString | null;
  readonly initialRisk: DecimalString | null;
  readonly realizedR: DecimalString | null;
  readonly averageEntryPrice: DecimalString | null;
  readonly averageExitPrice: DecimalString | null;
  readonly totalEnteredQuantity: DecimalString;
  readonly totalExitedQuantity: DecimalString;
  readonly remainingQuantity: DecimalString;
  readonly state: TradeMetricsState | null;
  readonly completeness: TradeMetricsCompleteness;
}

export type TradeMetricsResult =
  | { readonly ok: true; readonly value: TradeMetrics }
  | {
      readonly ok: false;
      readonly reason:
        | 'invalid-execution-decimal'
        | 'exit-without-entry'
        | 'over-exited'
        | 'invalid-risk-performance-decimal'
        | 'zero-initial-risk'
        | 'invalid-fee-decimal'
        | 'mixed-fee-currency'
        | 'invalid-net-pnl-decimal'
        | 'invalid-pnl-percentage-decimal'
        | 'zero-pnl-percentage-basis';
    };

function toMetricsState(
  balanceState: 'empty' | 'open' | 'partially-exited' | 'flat',
): TradeMetricsState | null {
  if (balanceState === 'empty') return null;
  if (balanceState === 'open') return 'unrealized';
  if (balanceState === 'partially-exited') return 'partially-realized';
  return 'realized';
}

export function calculateTradeMetrics(
  side: TradeSide,
  executions: readonly TradeExecutionRecord[],
  riskPerformanceInput?: TradeMetricsRiskPerformanceInput,
  fees?: readonly TradeFeeRecord[],
  netPnlCurrencyInput?: TradeMetricsNetPnlCurrencyInput,
  pnlPercentageInput?: TradeMetricsPnlPercentageInput,
  rMultipleInput?: TradeMetricsRMultipleInput,
): TradeMetricsResult {
  const balance = assessExecutionBalance(executions);
  if (!balance.ok) {
    return { ok: false, reason: balance.reason };
  }

  const grossPnlResult = calculateFlatTradeGrossRealizedPnl(side, executions);
  if (!grossPnlResult.ok) {
    return { ok: false, reason: grossPnlResult.reason };
  }

  const { entry, exit, netQuantity } = balance.aggregate;
  const grossPnl = grossPnlResult.available
    ? grossPnlResult.grossRealizedPnl
    : null;

  const riskPerformance = riskPerformanceInput
    ? calculateRiskPerformance(
        riskPerformanceInput.resultAmount,
        riskPerformanceInput.riskPerUnit,
        riskPerformanceInput.quantity,
      )
    : null;

  if (riskPerformance && !riskPerformance.ok) {
    return {
      ok: false,
      reason: riskPerformance.reason === 'zero-initial-risk'
        ? 'zero-initial-risk'
        : 'invalid-risk-performance-decimal',
    };
  }

  const rMultipleResult = !riskPerformanceInput && rMultipleInput
    ? calculateRMultiple(
        rMultipleInput.resultAmount,
        rMultipleInput.initialRiskAmount,
      )
    : null;

  if (rMultipleResult && !rMultipleResult.ok) {
    return {
      ok: false,
      reason: rMultipleResult.reason === 'zero-initial-risk'
        ? 'zero-initial-risk'
        : 'invalid-risk-performance-decimal',
    };
  }

  const initialRisk = riskPerformance?.initialRisk ?? rMultipleInput?.initialRiskAmount ?? null;
  const realizedR = riskPerformance?.realizedR ?? rMultipleResult?.value ?? null;

  const feeResult = fees === undefined
    ? null
    : calculateTotalFees(fees);

  if (feeResult && !feeResult.ok) {
    return {
      ok: false,
      reason: feeResult.reason === 'mixed-currency'
        ? 'mixed-fee-currency'
        : 'invalid-fee-decimal',
    };
  }

  const totalFees = feeResult?.totalFees ?? null;
  const totalFeesCurrency = feeResult?.currency ?? null;

  const netPnlResult = grossPnl !== null && totalFees !== null
    ? calculateComparableNetPnl(
        grossPnl,
        totalFees,
        netPnlCurrencyInput?.grossPnlCurrency ?? null,
        totalFeesCurrency,
      )
    : null;

  if (netPnlResult && !netPnlResult.ok) {
    return { ok: false, reason: 'invalid-net-pnl-decimal' };
  }

  const netPnl = netPnlResult?.available ? netPnlResult.netPnl : null;
  const netPnlCurrency = netPnlResult?.available ? netPnlResult.currency : null;

  const pnlPercentageResult = pnlPercentageInput
    ? calculatePercentage(
        pnlPercentageInput.resultAmount,
        pnlPercentageInput.basisAmount,
      )
    : null;

  if (pnlPercentageResult && !pnlPercentageResult.ok) {
    return {
      ok: false,
      reason: pnlPercentageResult.reason === 'zero-denominator'
        ? 'zero-pnl-percentage-basis'
        : 'invalid-pnl-percentage-decimal',
    };
  }

  const pnlPercent = pnlPercentageResult?.value ?? null;

  return {
    ok: true,
    value: Object.freeze({
      grossPnl,
      totalFees,
      totalFeesCurrency,
      netPnl,
      netPnlCurrency,
      pnlPercent,
      initialRisk,
      realizedR,
      averageEntryPrice: entry.weightedAveragePrice,
      averageExitPrice: exit.weightedAveragePrice,
      totalEnteredQuantity: entry.quantity,
      totalExitedQuantity: exit.quantity,
      remainingQuantity: netQuantity,
      state: toMetricsState(balance.state),
      completeness: Object.freeze({
        hasEntryExecutions: entry.quantity !== '0',
        hasExitExecutions: exit.quantity !== '0',
        hasAverageEntryPrice: entry.weightedAveragePrice !== null,
        hasAverageExitPrice: exit.weightedAveragePrice !== null,
        hasGrossPnl: grossPnl !== null,
        hasTotalFees: totalFees !== null,
        hasNetPnl: netPnl !== null,
        hasPnlPercent: pnlPercent !== null,
        hasInitialRisk: initialRisk !== null,
        hasRealizedR: realizedR !== null,
      }),
    }),
  };
}
