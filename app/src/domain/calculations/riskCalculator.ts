import type { DecimalString } from '../trades';
import {
  decimalAbs,
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
