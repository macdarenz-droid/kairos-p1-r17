import type { ChartEngineSeriesHandle } from './chartEngineDriver';
import type {
  ChartDrawingLayerDriver,
  ChartDrawingLayerDriverHandle,
} from './chartDrawingLayerPort';
import type { RendererChartDrawing } from './chartDrawingProjection';

/**
 * Narrow structural view of the Lightweight Charts v5 series primitive API.
 * P18.4 deliberately does not own primitive rendering internals.
 */
export interface LightweightChartsV5SeriesPrimitiveApi<TPrimitive> {
  attachPrimitive(primitive: TPrimitive): void;
  detachPrimitive(primitive: TPrimitive): void;
}

export type LightweightChartsV5SeriesPrimitiveResolver<TPrimitive> = (
  series: ChartEngineSeriesHandle,
) => LightweightChartsV5SeriesPrimitiveApi<TPrimitive>;

export interface LightweightChartsV5DrawingPrimitiveFactory<TPrimitive> {
  create(drawings: readonly RendererChartDrawing[]): TPrimitive;
}

/**
 * P18.4 vendor attachment invariant:
 * - the P18.3 provider-neutral lifecycle remains the caller-facing contract
 * - each replacement detaches the previous vendor primitive before attaching the next
 * - empty drawing input is still a presentation input owned by the injected factory
 * - detach() releases the currently attached primitive at most once
 * - no Canvas renderer, interaction state, persistence, calculation, or market/journal truth lives here
 */
export function createLightweightChartsV5DrawingLayerDriver<TPrimitive>(
  resolveSeries: LightweightChartsV5SeriesPrimitiveResolver<TPrimitive>,
  primitiveFactory: LightweightChartsV5DrawingPrimitiveFactory<TPrimitive>,
): ChartDrawingLayerDriver {
  return {
    attach(series: ChartEngineSeriesHandle): ChartDrawingLayerDriverHandle {
      const vendorSeries = resolveSeries(series);
      let activePrimitive: TPrimitive | null = null;
      let detached = false;

      return {
        replaceDrawings(drawings: readonly RendererChartDrawing[]): void {
          if (detached) throw new Error('lightweight-charts-drawing-layer-detached');

          if (activePrimitive !== null) {
            vendorSeries.detachPrimitive(activePrimitive);
          }

          const nextPrimitive = primitiveFactory.create(drawings);
          vendorSeries.attachPrimitive(nextPrimitive);
          activePrimitive = nextPrimitive;
        },

        detach(): void {
          if (detached) return;
          detached = true;

          if (activePrimitive !== null) {
            vendorSeries.detachPrimitive(activePrimitive);
            activePrimitive = null;
          }
        },
      };
    },
  };
}
