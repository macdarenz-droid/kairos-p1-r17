import type { DecimalString, TradeSide } from '../trades';
import {
  decimalAbs,
  decimalCompare,
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

export type MoneyAtRiskResult =
  | { readonly ok: true; readonly amount: DecimalString }
  | { readonly ok: false; readonly reason: 'no-size' | 'stop-at-entry' | 'stop-not-on-loss-side' | 'invalid-decimal' };

/** What a position loses if price reaches the stop, before fees: entry value − stop × size for a long, stop × size − entry value for a short. entryValue = Σ entry price × entry size. Kernel only, no division (D190). */
export function calculateMoneyAtRisk(side: TradeSide, entryValue: DecimalString, stopPrice: DecimalString, size: DecimalString): MoneyAtRiskResult {
  if (decimalCompare(entryValue, '0') === null || decimalCompare(stopPrice, '0') === null) return { ok: false, reason: 'invalid-decimal' };
  const sizeOrder = decimalCompare(size, '0');
  if (sizeOrder === null) return { ok: false, reason: 'invalid-decimal' };
  if (sizeOrder <= 0) return { ok: false, reason: 'no-size' };
  const stopValue = decimalMultiply(stopPrice, size);
  if (!stopValue.ok) return { ok: false, reason: 'invalid-decimal' };
  const difference = side === 'long' ? decimalSubtract(entryValue, stopValue.value) : decimalSubtract(stopValue.value, entryValue);
  if (!difference.ok) return { ok: false, reason: 'invalid-decimal' };
  const order = decimalCompare(difference.value, '0');
  if (order === null) return { ok: false, reason: 'invalid-decimal' };
  if (order === 0) return { ok: false, reason: 'stop-at-entry' };
  if (order < 0) return { ok: false, reason: 'stop-not-on-loss-side' };
  return { ok: true, amount: difference.value };
}

/** The same for one entry price: entryValue = entryPrice × size. */
export function calculateMoneyAtRiskFromPrice(side: TradeSide, entryPrice: DecimalString, stopPrice: DecimalString, size: DecimalString): MoneyAtRiskResult {
  if (decimalCompare(entryPrice, '0') === null || decimalCompare(stopPrice, '0') === null || decimalCompare(size, '0') === null) return { ok: false, reason: 'invalid-decimal' };
  const entryValue = decimalMultiply(entryPrice, size);
  if (!entryValue.ok) return { ok: false, reason: 'invalid-decimal' };
  return calculateMoneyAtRisk(side, entryValue.value, stopPrice, size);
}
