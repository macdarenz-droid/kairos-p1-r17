import type { RendererSeriesProjection } from './chartSeriesProjection';

export interface ChartEngineSession {
  replaceSeries(series: RendererSeriesProjection): void;
  destroy(): void;
}

export interface ChartEnginePort {
  create(container: HTMLElement): ChartEngineSession;
}
