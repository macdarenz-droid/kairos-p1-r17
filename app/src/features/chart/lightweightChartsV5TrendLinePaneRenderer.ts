import type { IPrimitivePaneRenderer } from 'lightweight-charts';
import type { LightweightChartsV5TrendLineScreenSegment } from './lightweightChartsV5TrendLineCoordinateProjection';

export interface LightweightChartsV5TrendLineStrokeStyle {
  readonly color: string;
  readonly lineWidth: number;
}

/**
 * P18.6 provider pane-rendering invariant:
 * - P18.5 screen-space segments are the only geometry input
 * - provider Canvas drawing is presentation-only and uses bitmap coordinate space
 * - stroke styling is injected presentation input, not drawing/domain truth
 * - no time/price conversion, primitive lifecycle, hit testing, interaction, persistence,
 *   autoscale, calculation, market acquisition, or journal truth is owned here
 */
export function createLightweightChartsV5TrendLinePaneRenderer(
  segments: readonly LightweightChartsV5TrendLineScreenSegment[],
  style: LightweightChartsV5TrendLineStrokeStyle,
): IPrimitivePaneRenderer {
  const snapshot = segments.map((segment) => ({
    ...segment,
    start: { ...segment.start },
    end: { ...segment.end },
  }));

  return {
    draw(target): void {
      target.useBitmapCoordinateSpace((scope) => {
        const { context, horizontalPixelRatio, verticalPixelRatio } = scope;
        const bitmapLineWidth = Math.max(1, Math.round(style.lineWidth * horizontalPixelRatio));

        context.save();
        try {
          context.strokeStyle = style.color;
          context.lineWidth = bitmapLineWidth;

          for (const segment of snapshot) {
            // Zones are drawn from T-021b on; until then only lines are drawn.
            if (segment.kind !== 'trend-line') continue;
            context.beginPath();
            context.moveTo(
              segment.start.x * horizontalPixelRatio,
              segment.start.y * verticalPixelRatio,
            );
            context.lineTo(
              segment.end.x * horizontalPixelRatio,
              segment.end.y * verticalPixelRatio,
            );
            context.stroke();
          }
        } finally {
          context.restore();
        }
      });
    },
  };
}
