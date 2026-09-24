import type { DecimalString } from '../trades';
import { decimalSubtract } from './decimalKernel';

export type NetPnlCurrencyCompatibilityResult =
  | {
      readonly ok: true;
      readonly compatible: true;
      readonly basis: 'zero-fees' | 'same-currency';
    }
  | {
      readonly ok: true;
      readonly compatible: false;
      readonly reason:
        | 'missing-gross-pnl-currency'
        | 'missing-fee-currency'
        | 'currency-mismatch';
    }
  | {
      readonly ok: false;
      readonly reason: 'invalid-decimal';
    };

/**
 * Proves whether authoritative gross P&L and fee evidence may be composed.
 *
 * Zero fees are unit-neutral, so no currency proof is required to subtract
 * them. Non-zero fees require explicit, identical currency evidence on both
 * sides. This policy performs no FX conversion or currency inference.
 */
export function assessNetPnlCurrencyCompatibility(
  totalFees: DecimalString,
  grossPnlCurrency: string | null,
  totalFeesCurrency: string | null,
): NetPnlCurrencyCompatibilityResult {
  const normalizedFees = decimalSubtract(totalFees, '0');
  if (!normalizedFees.ok) {
    return { ok: false, reason: 'invalid-decimal' };
  }

  if (normalizedFees.value === '0') {
    return { ok: true, compatible: true, basis: 'zero-fees' };
  }

  if (grossPnlCurrency === null) {
    return { ok: true, compatible: false, reason: 'missing-gross-pnl-currency' };
  }
  if (totalFeesCurrency === null) {
    return { ok: true, compatible: false, reason: 'missing-fee-currency' };
  }
  if (grossPnlCurrency !== totalFeesCurrency) {
    return { ok: true, compatible: false, reason: 'currency-mismatch' };
  }

  return { ok: true, compatible: true, basis: 'same-currency' };
}
