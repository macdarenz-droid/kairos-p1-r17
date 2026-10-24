import type { DecimalString } from '../../domain/trades';

export type ChartTimestamp = string;

export interface ChartPricePoint {
  readonly timestamp: ChartTimestamp;
  readonly price: DecimalString;
}

export interface ChartCandle {
  readonly openTime: ChartTimestamp;
  readonly closeTime: ChartTimestamp;
  readonly open: DecimalString;
  readonly high: DecimalString;
  readonly low: DecimalString;
  readonly close: DecimalString;
}

export type ChartSeries =
  | { readonly kind: 'price-line'; readonly points: readonly ChartPricePoint[] }
  | { readonly kind: 'candles'; readonly candles: readonly ChartCandle[] };

export interface ChartMarketReference {
  readonly venue: string;
  readonly instrument: string;
  readonly source: 'market-reference';
}

export interface ChartJournalExecutionReference {
  readonly executionId: string;
  readonly timestamp: ChartTimestamp;
  readonly price: DecimalString;
  readonly source: 'journal-execution';
}

export interface ChartRenderModel {
  readonly market: ChartMarketReference;
  readonly series: ChartSeries;
  readonly journalExecutions: readonly ChartJournalExecutionReference[];
}

export function createChartRenderModel(model: ChartRenderModel): ChartRenderModel {
  return model;
}
