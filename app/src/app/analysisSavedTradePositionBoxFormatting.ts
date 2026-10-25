import type { DecimalString } from '../domain/trades';

const rMultipleFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2, signDisplay: 'always', useGrouping: false });
const ratioFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2, signDisplay: 'never', useGrouping: false });

/**
 * Presentation-only rounding for the position box headline figures. The exact
 * released decimal strings remain unchanged and are still exposed as evidence.
 */
export function formatAnalysisSavedTradeRMultiple(value: DecimalString): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? rMultipleFormatter.format(numeric) : value;
}

export function formatAnalysisSavedTradeRatio(value: DecimalString): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? ratioFormatter.format(numeric) : value;
}
