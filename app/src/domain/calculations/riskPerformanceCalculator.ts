import type { DecimalString } from '../trades';
import { calculateRMultiple } from './rMultipleCalculator';
import { calculateInitialRiskAmount } from './riskCalculator';

export type RiskPerformanceCalculationResult =
  | {
      readonly ok: true;
      readonly initialRisk: DecimalString;
      readonly realizedR: DecimalString;
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'invalid-decimal'
        | 'zero-initial-risk';
    };

export function calculateRiskPerformance(
  resultAmount: DecimalString,
  riskPerUnit: DecimalString,
  quantity: DecimalString,
): RiskPerformanceCalculationResult {
  const initialRisk = calculateInitialRiskAmount(riskPerUnit, quantity);

  if (!initialRisk.ok) {
    return { ok: false, reason: 'invalid-decimal' };
  }

  const realizedR = calculateRMultiple(resultAmount, initialRisk.value);

  if (!realizedR.ok) {
    return {
      ok: false,
      reason: realizedR.reason,
    };
  }

  return {
    ok: true,
    initialRisk: initialRisk.value,
    realizedR: realizedR.value,
  };
}
