import type { ChartCandle, ChartRenderModel } from './chartRenderContract';
import type {
  ChartRendererFactory,
  ChartRendererLifecycle,
} from './chartRendererLifecycle';
import { projectChartCandle, projectChartSeries } from './chartSeriesProjection';
import type { ChartEnginePort } from './chartEnginePort';
import type { IncrementalChartEnginePort } from './chartEngineIncrementalPort';

export interface ProjectedIncrementalCandleRendererLifecycle
  extends ChartRendererLifecycle {
  updateLatestCandle(candle: ChartCandle): void;
}

export interface ProjectedIncrementalCandleRendererFactory {
  create(container: HTMLElement): ProjectedIncrementalCandleRendererLifecycle;
}

export function createProjectedChartRendererFactory(
  engine: ChartEnginePort,
): ChartRendererFactory {
  return {
    create(container: HTMLElement): ChartRendererLifecycle {
      const session = engine.create(container);
      let destroyed = false;

      return {
        render(model: ChartRenderModel): void {
          if (destroyed) {
            throw new Error('chart-renderer-destroyed');
          }
          session.replaceSeries(projectChartSeries(model));
        },
        destroy(): void {
          if (destroyed) return;
          destroyed = true;
          session.destroy();
        },
      };
    },
  };
}

/**
 * Binds one caller-projected latest candle to the released incremental engine.
 *
 * The caller still owns history, instrument/timeframe identity, ordering,
 * backfill and subscription lifecycle. This presentation boundary only
 * forwards an already-authoritative candle after an initial candle render.
 */
export function createProjectedIncrementalCandleRendererFactory(
  engine: IncrementalChartEnginePort,
): ProjectedIncrementalCandleRendererFactory {
  return {
    create(container: HTMLElement): ProjectedIncrementalCandleRendererLifecycle {
      const session = engine.create(container);
      let activeSeriesKind: ChartRenderModel['series']['kind'] | null = null;
      let destroyed = false;

      const assertActive = (): void => {
        if (destroyed) throw new Error('chart-renderer-destroyed');
      };

      return {
        render(model: ChartRenderModel): void {
          assertActive();
          session.replaceSeries(projectChartSeries(model));
          activeSeriesKind = model.series.kind;
        },
        updateLatestCandle(candle: ChartCandle): void {
          assertActive();
          if (activeSeriesKind !== 'candles') {
            throw new Error('chart-series-kind-mismatch');
          }
          session.updateLatest({
            kind: 'candles',
            candle: projectChartCandle(candle),
          });
        },
        destroy(): void {
          if (destroyed) return;
          destroyed = true;
          activeSeriesKind = null;
          session.destroy();
        },
      };
    },
  };
}
