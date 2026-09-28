import type { ChartIncrementalUpdate } from './chartIncrementalUpdate';
import type {
  LightweightChartsV5SeriesApi,
} from './lightweightChartsV5ModuleAdapter';
import type {
  RendererCandle,
  RendererPricePoint,
} from './chartSeriesProjection';

export type LightweightChartsV5IncrementalSeries =
  | {
      kind: 'price-line';
      series: LightweightChartsV5SeriesApi<RendererPricePoint>;
    }
  | {
      kind: 'candles';
      series: LightweightChartsV5SeriesApi<RendererCandle>;
    };

/**
 * Maps one already-projected Kairos incremental presentation item to the
 * matching Lightweight Charts v5 `ISeriesApi.update()` call.
 *
 * No historical updates are requested here; only latest/new-item semantics
 * are permitted by this boundary.
 */
export function applyLightweightChartsV5IncrementalUpdate(
  target: LightweightChartsV5IncrementalSeries,
  update: ChartIncrementalUpdate,
): void {
  if (target.kind !== update.kind) {
    throw new Error('chart-series-kind-mismatch');
  }

  if (target.kind === 'price-line' && update.kind === 'price-line') {
    target.series.update(update.point);
    return;
  }

  if (target.kind === 'candles' && update.kind === 'candles') {
    target.series.update(update.candle);
    return;
  }

  throw new Error('chart-series-kind-mismatch');
}
