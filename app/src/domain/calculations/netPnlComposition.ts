import type { DecimalString } from '../trades';
import { convertPenceAndPounds } from './currencyConversion';
import { calculateNetPnl } from './netPnlCalculator';
import { assessNetPnlCurrencyCompatibility } from './netPnlCurrencyPolicy';

export type NetPnlCompositionResult =
  | {
      readonly ok: true;
      readonly available: true;
      readonly netPnl: DecimalString;
      readonly currency: string | null;
      readonly basis: 'zero-fees' | 'same-currency' | 'pence-and-pounds';
    }
  | {
      readonly ok: true;
      readonly available: false;
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
 * Composes authoritative gross P&L and fee evidence only after currency
 * comparability has been proven. This boundary performs no FX conversion or
 * currency inference and preserves exact decimal arithmetic through the
 * existing Calculation Engine primitives.
 */
export function calculateComparableNetPnl(
  grossPnl: DecimalString,
  totalFees: DecimalString,
  grossPnlCurrency: string | null,
  totalFeesCurrency: string | null,
): NetPnlCompositionResult {
  const compatibility = assessNetPnlCurrencyCompatibility(
    totalFees,
    grossPnlCurrency,
    totalFeesCurrency,
  );

  if (!compatibility.ok) {
    return { ok: false, reason: 'invalid-decimal' };
  }

  if (!compatibility.compatible) {
    return {
      ok: true,
      available: false,
      reason: compatibility.reason,
    };
  }

  // P33: fees in pounds on a trade in pence (or the reverse) are the same money, converted exactly (D111).
  const fees = compatibility.basis === 'pence-and-pounds' && grossPnlCurrency !== null && totalFeesCurrency !== null
    ? convertPenceAndPounds(totalFees, totalFeesCurrency, grossPnlCurrency)
    : { ok: true as const, value: totalFees };
  if (fees === null || !fees.ok) return { ok: false, reason: 'invalid-decimal' };
  const netPnl = calculateNetPnl(grossPnl, fees.value);
  if (!netPnl.ok) {
    return { ok: false, reason: 'invalid-decimal' };
  }

  return {
    ok: true,
    available: true,
    netPnl: netPnl.netPnl,
    currency: grossPnlCurrency,
    basis: compatibility.basis,
  };
}
