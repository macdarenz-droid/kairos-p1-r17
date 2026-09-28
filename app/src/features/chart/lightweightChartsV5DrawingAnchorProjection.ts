import { parseDecimalString } from '../../domain/trades';
import type { ChartDrawingAnchor } from './chartDrawingContract';

export interface LightweightChartsV5DrawingAnchorPoint {
  readonly x: number;
  readonly y: number;
}

export interface LightweightChartsV5DrawingAnchorEvent {
  readonly time?: number;
  readonly point?: LightweightChartsV5DrawingAnchorPoint;
}

export interface LightweightChartsV5DrawingAnchorPriceApi {
  coordinateToPrice(coordinate: number): number | null;
}

function projectProviderEpochSeconds(time: number): string | null {
  if (!Number.isFinite(time)) return null;
  const date = new Date(time * 1000);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function providerNumberToPlainDecimal(value: number): string | null {
  if (!Number.isFinite(value)) return null;

  const text = String(value);
  if (!/[eE]/.test(text)) return text;

  const match = /^(-?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/.exec(text);
  if (!match) return null;

  const [, sign, integerPart, fractionPart = '', exponentText] = match;
  const exponent = Number(exponentText);
  if (!Number.isSafeInteger(exponent)) return null;

  const digits = integerPart + fractionPart;
  const decimalIndex = integerPart.length + exponent;

  if (decimalIndex <= 0) {
    return `${sign}0.${'0'.repeat(-decimalIndex)}${digits}`;
  }
  if (decimalIndex >= digits.length) {
    return `${sign}${digits}${'0'.repeat(decimalIndex - digits.length)}`;
  }
  return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

function projectProviderPrice(price: number): ChartDrawingAnchor['price'] | null {
  const normalized = providerNumberToPlainDecimal(price);
  if (normalized === null) return null;
  const parsed = parseDecimalString(normalized);
  return parsed.ok ? parsed.value : null;
}

/**
 * P18.25R1 Lightweight Charts v5 reverse anchor projection.
 *
 * The provider event owns screen/time evidence and the active series owns
 * y-coordinate -> price conversion. This function projects that evidence into
 * the existing provider-neutral ChartDrawingAnchor contract and fails closed
 * when any required value is unavailable.
 *
 * Numeric provider evidence is normalized locally into plain decimal notation
 * before entering the existing domain parser. The chart feature does not take
 * ownership of calculation-domain arithmetic.
 *
 * It owns no click/crosshair subscription lifecycle, interaction transition,
 * drawing mutation, persistence, toolbar state, journal truth, or P19 behavior.
 */
export function projectLightweightChartsV5DrawingAnchor(
  event: LightweightChartsV5DrawingAnchorEvent,
  series: LightweightChartsV5DrawingAnchorPriceApi,
): ChartDrawingAnchor | null {
  if (event.time === undefined || event.point === undefined) return null;

  const timestamp = projectProviderEpochSeconds(event.time);
  const providerPrice = series.coordinateToPrice(event.point.y);
  if (timestamp === null || providerPrice === null) return null;

  const price = projectProviderPrice(providerPrice);
  if (price === null) return null;

  return { timestamp, price };
}
