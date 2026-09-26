import type { TradeMetrics } from '../../domain/calculations';
import { parseDecimalString, type DecimalString } from '../../domain/trades';

export type VisualPnlOutcome = 'profit' | 'loss' | 'breakeven' | 'unavailable';
export type VisualPnlAmountSource = 'net-pnl' | 'gross-pnl-zero-fees' | 'none';

export interface VisualPnlOutcomeProjection {
  readonly outcome: VisualPnlOutcome;
  readonly label: 'Profit' | 'Loss' | 'Break-even' | 'Not available';
  readonly amount: DecimalString | null;
  readonly currency: string | null;
  readonly source: VisualPnlAmountSource;
}

function unavailable(): VisualPnlOutcomeProjection {
  return Object.freeze({
    outcome: 'unavailable',
    label: 'Not available',
    amount: null,
    currency: null,
    source: 'none',
  });
}

function classify(amount: DecimalString, currency: string | null, source: Exclude<VisualPnlAmountSource, 'none'>): VisualPnlOutcomeProjection {
  const parsed = parseDecimalString(String(amount));
  if (!parsed.ok) return unavailable();

  const normalized = parsed.value;
  const isZero = /^-?0(?:\.0+)?$/.test(normalized);
  const outcome: Exclude<VisualPnlOutcome, 'unavailable'> = isZero
    ? 'breakeven'
    : normalized.startsWith('-')
      ? 'loss'
      : 'profit';

  const label = outcome === 'profit' ? 'Profit' : outcome === 'loss' ? 'Loss' : 'Break-even';
  return Object.freeze({ outcome, label, amount: normalized, currency, source });
}

/**
 * Projects already-authoritative P11 trade metrics into a visual P&L semantic.
 *
 * No financial arithmetic is performed here. Net P&L is preferred when P11 can
 * prove currency comparability. Gross P&L is only equivalent enough for the
 * visual outcome when authoritative fee evidence is explicitly zero. Unknown or
 * non-zero fees without comparable net P&L stay unavailable rather than being
 * presented as profit/loss.
 */
export function projectVisualPnlOutcome(metrics: TradeMetrics | null): VisualPnlOutcomeProjection {
  if (metrics === null) return unavailable();

  if (metrics.netPnl !== null) {
    return classify(metrics.netPnl, metrics.netPnlCurrency, 'net-pnl');
  }

  if (metrics.grossPnl !== null && metrics.totalFees === '0') {
    return classify(metrics.grossPnl, null, 'gross-pnl-zero-fees');
  }

  return unavailable();
}
