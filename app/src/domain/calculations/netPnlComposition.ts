import type { DecimalString } from '../trades';
import { calculateNetPnl } from './netPnlCalculator';
import { assessNetPnlCurrencyCompatibility } from './netPnlCurrencyPolicy';

export type NetPnlCompositionResult =
  | {
      readonly ok: true;
      readonly available: true;
      readonly netPnl: DecimalString;
      readonly currency: string | null;
      readonly basis: 'zero-fees' | 'same-currency';
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

  const netPnl = calculateNetPnl(grossPnl, totalFees);
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
