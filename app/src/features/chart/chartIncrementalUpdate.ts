import type {
  RendererCandle,
  RendererPricePoint,
} from './chartSeriesProjection';

export type ChartIncrementalUpdate =
  | {
      kind: 'price-line';
      point: RendererPricePoint;
    }
  | {
      kind: 'candles';
      candle: RendererCandle;
    };

/**
 * Presentation-only incremental update contract.
 *
 * This contract describes one already-projected latest/new visual data item.
 * It does not acquire market data, decide freshness, reconcile journal truth,
 * persist anything, or perform financial calculations.
 */
export function defineChartIncrementalUpdate(
  update: ChartIncrementalUpdate,
): ChartIncrementalUpdate {
  return update;
}
