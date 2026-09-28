import type { DecimalString } from '../../domain/trades';
import type { ChartDrawing, ChartDrawingAnchor } from './chartDrawingContract';
import type { ChartTimestamp } from './chartRenderContract';
import { projectChartDecimal, projectChartPricePoint, projectChartTimestamp, type RendererPricePoint } from './chartSeriesProjection';

export type RendererDrawingAnchor = RendererPricePoint;

export interface RendererTrendLineDrawing {
  readonly id: string;
  readonly kind: 'trend-line';
  readonly start: RendererDrawingAnchor;
  readonly end: RendererDrawingAnchor;
}

export interface RendererZoneDrawing {
  readonly id: string;
  readonly kind: 'zone';
  readonly start: RendererDrawingAnchor;
  readonly end: RendererDrawingAnchor;
}

/**
 * A user risk/reward box, presentation only: it is never a saved ChartDrawing.
 * `start` is the entry at the left time, `end` the stop at the right time.
 */
export interface RendererRiskBoxDrawing {
  readonly id: string;
  readonly kind: 'risk-box';
  readonly start: RendererDrawingAnchor;
  readonly end: RendererDrawingAnchor;
  readonly target: number;
  readonly label: string;
}

export type RendererChartDrawing = RendererTrendLineDrawing | RendererZoneDrawing | RendererRiskBoxDrawing;

export interface ChartRiskBoxDrawingInput {
  readonly id: string;
  readonly entry: DecimalString;
  readonly stop: DecimalString;
  readonly target: DecimalString;
  readonly start: ChartTimestamp;
  readonly end: ChartTimestamp;
  readonly label: string;
}

/** Projects a user box for drawing; a value that does not parse gives null, so a damaged box is skipped. */
export function projectChartRiskBoxDrawing(input: ChartRiskBoxDrawingInput): RendererRiskBoxDrawing | null {
  try {
    const startTime = projectChartTimestamp(input.start);
    const endTime = projectChartTimestamp(input.end);
    return {
      id: input.id,
      kind: 'risk-box',
      start: { time: startTime, value: projectChartDecimal(input.entry) },
      end: { time: endTime, value: projectChartDecimal(input.stop) },
      target: projectChartDecimal(input.target),
      label: input.label,
    };
  } catch {
    return null;
  }
}

export function projectChartDrawingAnchor(
  anchor: ChartDrawingAnchor,
): RendererDrawingAnchor {
  return projectChartPricePoint(anchor);
}

export function projectChartDrawing(
  drawing: ChartDrawing,
): RendererChartDrawing {
  const start = projectChartDrawingAnchor(drawing.start);
  const end = projectChartDrawingAnchor(drawing.end);
  return drawing.kind === 'zone'
    ? { id: drawing.id, kind: 'zone', start, end }
    : { id: drawing.id, kind: 'trend-line', start, end };
}

/**
 * P18.36 ordered drawing-collection projection.
 *
 * P18.2 remains the sole domain-drawing -> renderer-drawing projection owner.
 * This helper only projects one immutable drawing snapshot in insertion order so
 * later presentation/selection composition does not reimplement projection at a
 * UI or provider boundary. It owns no collection mutation, presentation
 * lifecycle, interaction state, persistence, provider APIs, or P19 semantics.
 */
export function projectChartDrawings(
  drawings: readonly ChartDrawing[],
): readonly RendererChartDrawing[] {
  return drawings.map(projectChartDrawing);
}
