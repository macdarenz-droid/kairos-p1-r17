import type { DecimalString } from '../trades';
import { isPenceAndPounds } from './currencyConversion';
import { decimalSubtract } from './decimalKernel';

export type NetPnlCurrencyCompatibilityResult =
  | {
      readonly ok: true;
      readonly compatible: true;
      readonly basis: 'zero-fees' | 'same-currency' | 'pence-and-pounds';
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
 *
 * Pence and pounds (GBX and GBP) are the same money, 100 GBX = 1 GBP (P33);
 * no other pair is ever converted here.
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
  if (isPenceAndPounds(grossPnlCurrency, totalFeesCurrency)) return { ok: true, compatible: true, basis: 'pence-and-pounds' };
  if (grossPnlCurrency !== totalFeesCurrency) {
    return { ok: true, compatible: false, reason: 'currency-mismatch' };
  }

  return { ok: true, compatible: true, basis: 'same-currency' };
}
