import type { DecimalString } from '../domain/trades';

const standardMovementFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
  signDisplay: 'always',
  useGrouping: false,
});

/** Analysis evidence keeps two digits; only the bubble label is shortened to one. */
const preciseMovementFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  signDisplay: 'always',
  useGrouping: false,
});

const compactMovementFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  notation: 'compact',
  signDisplay: 'always',
  useGrouping: false,
});

const smallMovementFormatter = new Intl.NumberFormat('en-US', {
  maximumSignificantDigits: 2,
  signDisplay: 'always',
  useGrouping: false,
});

/**
 * Formats one authoritative movement value for the constrained bubble label.
 * The source decimal remains unchanged; this is presentation-only rounding.
 */
export function formatHomeDashboardLiveCryptoBubbleMovement(
  value: DecimalString | null,
  unavailable: boolean,
  options: { readonly fractionDigits?: 1 | 2 } = {},
): string {
  if (unavailable || value === null) return 'Unavailable';

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'Unavailable';

  const magnitude = Math.abs(numeric);
  if (magnitude >= 1000) return `${compactMovementFormatter.format(numeric)}%`;
  if (magnitude > 0 && magnitude < 0.01) return `${smallMovementFormatter.format(numeric)}%`;
  return `${(options.fractionDigits === 2 ? preciseMovementFormatter : standardMovementFormatter).format(numeric)}%`;
}
