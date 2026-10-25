import type {
  ChartCandle,
  ChartPricePoint,
  ChartRenderModel,
} from './chartRenderContract';

export type ChartEpochSeconds = number;

export interface RendererPricePoint {
  readonly time: ChartEpochSeconds;
  readonly value: number;
}

export interface RendererCandle {
  readonly time: ChartEpochSeconds;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

export function projectChartTimestamp(timestamp: string): ChartEpochSeconds {
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) {
    throw new Error('invalid-chart-timestamp');
  }
  return Math.floor(milliseconds / 1000);
}

export function projectChartDecimal(value: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error('invalid-chart-decimal');
  }
  return numeric;
}

export function projectChartPricePoint(
  point: ChartPricePoint,
): RendererPricePoint {
  return {
    time: projectChartTimestamp(point.timestamp),
    value: projectChartDecimal(point.price),
  };
}

export function projectChartCandle(
  candle: ChartCandle,
): RendererCandle {
  return {
    time: projectChartTimestamp(candle.openTime),
    open: projectChartDecimal(candle.open),
    high: projectChartDecimal(candle.high),
    low: projectChartDecimal(candle.low),
    close: projectChartDecimal(candle.close),
  };
}

export type RendererSeriesProjection =
  | {
      readonly kind: 'price-line';
      readonly data: readonly RendererPricePoint[];
    }
  | {
      readonly kind: 'candles';
      readonly data: readonly RendererCandle[];
    };

export function projectChartSeries(
  model: ChartRenderModel,
): RendererSeriesProjection {
  if (model.series.kind === 'price-line') {
    return {
      kind: 'price-line',
      data: model.series.points.map(projectChartPricePoint),
    };
  }

  return {
    kind: 'candles',
    data: model.series.candles.map(projectChartCandle),
  };
}
