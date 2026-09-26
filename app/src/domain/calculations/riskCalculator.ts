import type { DecimalString } from '../trades';
import {
  decimalAbs,
  decimalDivide,
  decimalMultiply,
  decimalSubtract,
} from './decimalKernel';

export type RiskPriceDistanceResult =
  | { readonly ok: true; readonly value: DecimalString }
  | { readonly ok: false; readonly reason: 'invalid-decimal' };

export function calculateRiskPriceDistance(
  plannedEntryPrice: DecimalString,
  plannedStopPrice: DecimalString,
): RiskPriceDistanceResult {
  const difference = decimalSubtract(plannedEntryPrice, plannedStopPrice);
  if (!difference.ok) {
    return { ok: false, reason: 'invalid-decimal' };
  }

  const distance = decimalAbs(difference.value);
  if (!distance.ok) {
    return { ok: false, reason: 'invalid-decimal' };
  }

  return {
    ok: true,
    value: distance.value,
  };
}


export type InitialRiskAmountResult =
  | { readonly ok: true; readonly value: DecimalString }
  | { readonly ok: false; readonly reason: 'invalid-decimal' };

export function calculateInitialRiskAmount(
  riskPerUnit: DecimalString,
  quantity: DecimalString,
): InitialRiskAmountResult {
  const amount = decimalMultiply(riskPerUnit, quantity);

  if (!amount.ok) {
    return { ok: false, reason: 'invalid-decimal' };
  }

  return {
    ok: true,
    value: amount.value,
  };
}

export type RiskBudgetResult =
  | { readonly ok: true; readonly value: DecimalString }
  | { readonly ok: false; readonly reason: 'invalid-decimal' };

/** The risk budget: the most you are willing to lose on one trade = account size × risk percent ÷ 100. Signs are not checked here (callers validate). */
export function calculateRiskBudget(accountSize: DecimalString, riskPercent: DecimalString): RiskBudgetResult {
  const product = decimalMultiply(accountSize, riskPercent);
  if (!product.ok) return { ok: false, reason: 'invalid-decimal' };
  const budget = decimalDivide(product.value, '100');
  return budget.ok ? { ok: true, value: budget.value } : { ok: false, reason: 'invalid-decimal' };
}
