import type { DecimalString } from '../trades';
import { decimalSubtract } from './decimalKernel';

export type NetPnlCalculationResult =
  | {
      readonly ok: true;
      readonly netPnl: DecimalString;
    }
  | {
      readonly ok: false;
      readonly reason: 'invalid-decimal';
    };

/**
 * Calculates net P&L from already-authoritative monetary evidence.
 *
 * The caller owns proof that grossPnl and totalFees are expressed in the
 * same monetary unit. This primitive deliberately performs no currency
 * inference or conversion.
 */
export function calculateNetPnl(
  grossPnl: DecimalString,
  totalFees: DecimalString,
): NetPnlCalculationResult {
  const result = decimalSubtract(grossPnl, totalFees);

  if (!result.ok) {
    return { ok: false, reason: 'invalid-decimal' };
  }

  return {
    ok: true,
    netPnl: result.value,
  };
}
