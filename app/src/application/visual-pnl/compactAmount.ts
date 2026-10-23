/**
 * U5 (P13.A4, D203): the one owner of short amounts for small spaces (calendar cells, heatmap cells, market tiles).
 * Everything goes through the decimal kernel; the exact amount always stays in the control's name, one tap away.
 */

import { decimalAbs, decimalCompare, decimalDivide, decimalRound } from '../../domain/calculations/decimalKernel';
import type { DecimalString } from '../../domain/trades';

const UNITS: readonly (readonly [DecimalString, string])[] = Object.freeze([
  ['1000000000' as DecimalString, 'B'],
  ['1000000' as DecimalString, 'M'],
  ['1000' as DecimalString, 'K'],
]);
const THOUSAND = '1000' as DecimalString;

const atLeast = (value: DecimalString, floor: string): boolean => (decimalCompare(value, floor) ?? -1) >= 0;

/** `value` ÷ the unit at `index`, half up to 1 place; a rounding that reaches 1000 moves up one unit. */
function inUnit(value: DecimalString, index: number): string | null {
  const [size, name] = UNITS[index];
  const divided = decimalDivide(value, size);
  const rounded = divided.ok ? decimalRound(divided.value, 1, 'half-up') : divided;
  if (!rounded.ok) return null;
  if (index > 0 && atLeast(rounded.value, THOUSAND)) return inUnit(value, index - 1);
  return `${rounded.value}${name}`;
}

/** |x| below 1: two significant digits. */
function belowOne(value: DecimalString): string | null {
  for (let places = 1; places <= 19; places += 1) {
    const down = decimalRound(value, places, 'down');
    if (!down.ok) return null;
    if (down.value === '0') continue;
    const shown = decimalRound(value, places + 1, 'half-up');
    return shown.ok ? shown.value : null;
  }
  return value;
}

/** |x| from 1 to below 1000: 2, 1 or 0 places; a rounding that reaches 1000 is shown as 1K. */
function belowThousand(value: DecimalString): string | null {
  const places = atLeast(value, '100') ? 0 : atLeast(value, '10') ? 1 : 2;
  const shown = decimalRound(value, places, 'half-up');
  if (!shown.ok) return null;
  return atLeast(shown.value, THOUSAND) ? inUnit(value, UNITS.length - 1) : shown.value;
}

/** A short amount for small spaces (calendar cells, heatmap cells, tiles): "+1.2K", "-85", "+12.3", "+0.0042", "0". The exact amount stays in the control's name. Null when the kernel refuses the value. */
export function describeVisualPnlCompactAmount(amount: DecimalString): string | null {
  const sign = decimalCompare(amount, '0');
  if (sign === null) return null;
  if (sign === 0) return '0';
  const size = decimalAbs(amount);
  if (!size.ok) return null;
  const unit = UNITS.findIndex(([floor]) => atLeast(size.value, floor));
  const shown = unit >= 0 ? inUnit(size.value, unit) : atLeast(size.value, '1') ? belowThousand(size.value) : belowOne(size.value);
  return shown === null ? null : `${sign > 0 ? '+' : '-'}${shown}`;
}
