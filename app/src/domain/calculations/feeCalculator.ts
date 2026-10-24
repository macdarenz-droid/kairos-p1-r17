import type { DecimalString, TradeFeeRecord } from '../trades';
import { decimalSum } from './decimalKernel';

export type FeeCalculationResult =
  | {
      readonly ok: true;
      readonly totalFees: DecimalString;
      readonly currency: string | null;
    }
  | {
      readonly ok: false;
      readonly reason: 'invalid-decimal' | 'mixed-currency';
    };

export function calculateTotalFees(
  fees: readonly TradeFeeRecord[],
): FeeCalculationResult {
  if (fees.length === 0) {
    return {
      ok: true,
      totalFees: '0' as DecimalString,
      currency: null,
    };
  }

  const currency = fees[0].currency;
  if (fees.some((fee) => fee.currency !== currency)) {
    return { ok: false, reason: 'mixed-currency' };
  }

  const total = decimalSum(fees.map((fee) => fee.amount));
  if (!total.ok) {
    return { ok: false, reason: 'invalid-decimal' };
  }

  return {
    ok: true,
    totalFees: total.value,
    currency,
  };
}
