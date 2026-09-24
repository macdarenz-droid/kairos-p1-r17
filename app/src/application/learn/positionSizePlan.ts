/**
 * P24 'How much can I buy?': the one owner of the plan a person gets from account size, % at risk, entry and stop. Reuses the risk-distance, position-size, initial-risk and risk-budget owners; nothing is stored.
 */

import { decimalCompare, decimalMultiply, decimalRound } from '../../domain/calculations/decimalKernel';
import { calculatePositionSize } from '../../domain/calculations/positionSizeCalculator';
import { calculateInitialRiskAmount, calculateRiskBudget, calculateRiskPriceDistance } from '../../domain/calculations/riskCalculator';
import type { LearnPictureSpec } from '../../domain/learn/learnPicture';
import { parseDecimalString, parsePositiveDecimalString, type DecimalString } from '../../domain/trades';

/** The size is rounded down to this many places, so the loss at the stop never exceeds the budget. */
export const POSITION_SIZE_DECIMAL_PLACES = 8;

export type PlanningNumberResult =
  | { readonly ok: true; readonly value: DecimalString }
  | { readonly ok: false; readonly reason: 'missing' | 'not-a-number' | 'must-be-positive' };

/** Reads one typed box: empty is missing (never zero), then a decimal, then above zero. */
export function parsePlanningNumber(text: string): PlanningNumberResult {
  if (text.trim() === '') return { ok: false, reason: 'missing' };
  if (!parseDecimalString(text).ok) return { ok: false, reason: 'not-a-number' };
  const positive = parsePositiveDecimalString(text);
  return positive.ok ? { ok: true, value: positive.value } : { ok: false, reason: 'must-be-positive' };
}

export type PositionSizeField = 'accountSize' | 'riskPercent' | 'entryPrice' | 'stopPrice';
export type PositionSizeProblemReason = 'missing' | 'not-a-number' | 'must-be-positive' | 'percent-over-100' | 'stop-equals-entry' | 'too-small' | 'calculation-failed';
export interface PositionSizeProblem { readonly field: PositionSizeField | null; readonly reason: PositionSizeProblemReason }
export interface PositionSizePlan {
  readonly side: 'long' | 'short';
  readonly accountSize: DecimalString; readonly riskPercent: DecimalString; readonly entryPrice: DecimalString; readonly stopPrice: DecimalString;
  /** calculateRiskBudget */
  readonly riskBudget: DecimalString;
  /** calculateRiskPriceDistance(entry, stop) */
  readonly riskPerUnit: DecimalString;
  /** calculatePositionSize, rounded down to POSITION_SIZE_DECIMAL_PLACES */
  readonly size: DecimalString;
  /** The exact quotient differs from size. */
  readonly sizeWasRounded: boolean;
  /** calculateInitialRiskAmount(riskPerUnit, size); never above riskBudget */
  readonly amountAtRisk: DecimalString;
  /** size × entry: what the trade is worth at the entry price */
  readonly positionValue: DecimalString;
  /** positionValue > accountSize */
  readonly needsBorrowedMoney: boolean;
  /** { kind: 'risk-box', side, target: false, highlight: 'risk' } */
  readonly picture: LearnPictureSpec;
}
export type PositionSizePlanResult =
  | { readonly ok: true; readonly plan: PositionSizePlan }
  | { readonly ok: false; readonly problems: readonly PositionSizeProblem[] };

const FIELDS: readonly PositionSizeField[] = ['accountSize', 'riskPercent', 'entryPrice', 'stopPrice'];
const refuse = (...problems: PositionSizeProblem[]): PositionSizePlanResult => Object.freeze({ ok: false, problems: Object.freeze(problems.map((problem) => Object.freeze(problem))) });
const failed = (): PositionSizePlanResult => refuse({ field: null, reason: 'calculation-failed' });

export function projectPositionSizePlan(input: Readonly<Record<PositionSizeField, string>>): PositionSizePlanResult {
  const values: Partial<Record<PositionSizeField, DecimalString>> = {};
  const problems: PositionSizeProblem[] = [];
  for (const field of FIELDS) {
    const parsed = parsePlanningNumber(input[field]);
    if (!parsed.ok) problems.push({ field, reason: parsed.reason });
    else if (field === 'riskPercent' && decimalCompare(parsed.value, '100') === 1) problems.push({ field, reason: 'percent-over-100' });
    else values[field] = parsed.value;
  }
  if (problems.length > 0) return refuse(...problems);
  const { accountSize, riskPercent, entryPrice, stopPrice } = values as Record<PositionSizeField, DecimalString>;

  const distance = calculateRiskPriceDistance(entryPrice, stopPrice);
  if (!distance.ok) return failed();
  if (distance.value === '0') return refuse({ field: 'stopPrice', reason: 'stop-equals-entry' });
  const riskPerUnit = distance.value;

  const order = decimalCompare(stopPrice, entryPrice);
  if (order === null) return failed();
  const side = order === -1 ? 'long' : 'short';
  const budget = calculateRiskBudget(accountSize, riskPercent);
  if (!budget.ok) return failed();
  const exact = calculatePositionSize(budget.value, riskPerUnit);
  if (!exact.ok) return failed();
  const size = decimalRound(exact.value, POSITION_SIZE_DECIMAL_PLACES, 'down');
  if (!size.ok) return failed();
  if (size.value === '0') return refuse({ field: null, reason: 'too-small' });
  const amountAtRisk = calculateInitialRiskAmount(riskPerUnit, size.value);
  const positionValue = decimalMultiply(size.value, entryPrice);
  if (!amountAtRisk.ok || !positionValue.ok) return failed();
  const valueOrder = decimalCompare(positionValue.value, accountSize);
  const roundedOrder = decimalCompare(exact.value, size.value);
  if (valueOrder === null || roundedOrder === null) return failed();

  return Object.freeze({
    ok: true,
    plan: Object.freeze({
      side, accountSize, riskPercent, entryPrice, stopPrice,
      riskBudget: budget.value,
      riskPerUnit,
      size: size.value,
      sizeWasRounded: roundedOrder !== 0,
      amountAtRisk: amountAtRisk.value,
      positionValue: positionValue.value,
      needsBorrowedMoney: valueOrder === 1,
      picture: Object.freeze({ kind: 'risk-box', side, target: false, highlight: 'risk' } as const),
    }),
  });
}
