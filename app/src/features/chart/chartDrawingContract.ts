import type { DecimalString } from '../../domain/trades';
import type { ChartTimestamp } from './chartRenderContract';

export type ChartDrawingId = string;
export type ChartDrawingKind = 'trend-line' | 'zone';

export interface ChartDrawingAnchor {
  readonly timestamp: ChartTimestamp;
  readonly price: DecimalString;
}

export interface ChartTrendLineDrawing {
  readonly id: ChartDrawingId;
  readonly kind: 'trend-line';
  readonly start: ChartDrawingAnchor;
  readonly end: ChartDrawingAnchor;
}

/** A rectangle placed with two taps; `start` and `end` are opposite corners, kept in the order the user placed them. */
export interface ChartZoneDrawing {
  readonly id: ChartDrawingId;
  readonly kind: 'zone';
  readonly start: ChartDrawingAnchor;
  readonly end: ChartDrawingAnchor;
}

export type ChartDrawing = ChartTrendLineDrawing | ChartZoneDrawing;

export function defineChartDrawing<T extends ChartDrawing>(drawing: T): T {
  return drawing;
}
