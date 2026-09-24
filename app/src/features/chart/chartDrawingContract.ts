import type { DecimalString } from '../../domain/trades';
import type { ChartTimestamp } from './chartRenderContract';

export type ChartDrawingId = string;
export type ChartDrawingKind = 'trend-line';

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

export type ChartDrawing = ChartTrendLineDrawing;

export function defineChartDrawing(drawing: ChartDrawing): ChartDrawing {
  return drawing;
}
