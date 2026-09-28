import type { ChartIncrementalUpdate } from './chartIncrementalUpdate';
import type { ChartEnginePort, ChartEngineSession } from './chartEnginePort';

export interface IncrementalChartEngineSession extends ChartEngineSession {
  updateLatest(update: ChartIncrementalUpdate): void;
}

export interface IncrementalChartEnginePort extends ChartEnginePort {
  create(container: HTMLElement): IncrementalChartEngineSession;
}

export function defineIncrementalChartEnginePort(
  port: IncrementalChartEnginePort,
): IncrementalChartEnginePort {
  return port;
}
