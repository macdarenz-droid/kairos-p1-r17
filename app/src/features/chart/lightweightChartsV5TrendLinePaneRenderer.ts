import type { IPrimitivePaneRenderer } from 'lightweight-charts';
import type { LightweightChartsV5TrendLineScreenSegment } from './lightweightChartsV5TrendLineCoordinateProjection';

export interface LightweightChartsV5TrendLineStrokeStyle {
  readonly color: string;
  readonly lineWidth: number;
  /** Zone fill and border colour; defaults to `color`. */
  readonly zoneColor?: string;
  /** Zone fill opacity from 0 to 1; defaults to 0.15. */
  readonly zoneFillOpacity?: number;
}

const DEFAULT_ZONE_FILL_OPACITY = 0.15;
const ZONE_HANDLE_SIZE_CSS_PX = 6;

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
          // Zones first, so lines stay on top. Fill APIs are touched only when a zone exists.
          const zones = snapshot.filter((segment) => segment.kind === 'zone');
          if (zones.length > 0) {
            const zoneColor = style.zoneColor ?? style.color;
            const opacity = Math.min(1, Math.max(0, style.zoneFillOpacity ?? DEFAULT_ZONE_FILL_OPACITY));
            const handleWidth = ZONE_HANDLE_SIZE_CSS_PX * horizontalPixelRatio;
            const handleHeight = ZONE_HANDLE_SIZE_CSS_PX * verticalPixelRatio;
            context.fillStyle = zoneColor;
            context.strokeStyle = zoneColor;
            context.lineWidth = bitmapLineWidth;
            for (const zone of zones) {
              const x1 = zone.start.x * horizontalPixelRatio, y1 = zone.start.y * verticalPixelRatio;
              const x2 = zone.end.x * horizontalPixelRatio, y2 = zone.end.y * verticalPixelRatio;
              const left = Math.min(x1, x2), top = Math.min(y1, y2), width = Math.abs(x2 - x1), height = Math.abs(y2 - y1);
              context.globalAlpha = opacity;
              context.fillRect(left, top, width, height);
              context.globalAlpha = 1;
              context.strokeRect(left, top, width, height);
              // The two placed corners are the handles.
              context.fillRect(x1 - handleWidth / 2, y1 - handleHeight / 2, handleWidth, handleHeight);
              context.fillRect(x2 - handleWidth / 2, y2 - handleHeight / 2, handleWidth, handleHeight);
            }
          }

          context.strokeStyle = style.color;
          context.lineWidth = bitmapLineWidth;

          for (const segment of snapshot) {
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
