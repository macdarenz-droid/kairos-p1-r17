import { createSeriesMarkers } from 'lightweight-charts';
import type {
  ISeriesApi,
  ISeriesMarkersPluginApi,
  SeriesMarker,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import type { ChartTheme } from '../design-system/themes/chartThemeAdapter';
import {
  projectChartDecimal,
  projectChartTimestamp,
} from '../features/chart/chartSeriesProjection';
import type {
  AnalysisSavedTradeExecutionMarkerProjection,
  AnalysisSavedTradeUnplacedExecution,
} from './analysisSavedTradeExecutionMarkerProjection';

export type AnalysisSavedTradeMarkerSeries = ISeriesApi<'Candlestick', Time>;

export interface AnalysisSavedTradeSeriesMarkersPlugin {
  setMarkers(markers: SeriesMarker<Time>[]): void;
  detach(): void;
}

export type AnalysisSavedTradeSeriesMarkersFactory = (
  series: AnalysisSavedTradeMarkerSeries,
  markers: SeriesMarker<Time>[],
) => AnalysisSavedTradeSeriesMarkersPlugin;

export type AnalysisSavedTradeMarkerPresentation =
  | {
      readonly kind: 'unavailable';
      readonly reason: Extract<AnalysisSavedTradeExecutionMarkerProjection, { readonly kind: 'unavailable' }>['reason'];
    }
  | {
      readonly kind: 'presented';
      readonly markerCount: number;
      readonly unplacedExecutions: readonly AnalysisSavedTradeUnplacedExecution[];
    };

export interface AnalysisSavedTradeLightweightChartsV5MarkerBinding {
  present(
    projection: AnalysisSavedTradeExecutionMarkerProjection,
    theme: ChartTheme,
  ): AnalysisSavedTradeMarkerPresentation;
  close(): void;
}

const productionSeriesMarkersFactory: AnalysisSavedTradeSeriesMarkersFactory = (
  series,
  markers,
) => createSeriesMarkers(series, markers) as ISeriesMarkersPluginApi<Time>;

function providerMarkers(
  projection: Extract<AnalysisSavedTradeExecutionMarkerProjection, { readonly kind: 'markers-ready' }>,
  theme: ChartTheme,
): SeriesMarker<Time>[] {
  return projection.markers
    .map((marker): SeriesMarker<Time> => ({
      id: marker.markerId,
      time: projectChartTimestamp(marker.candleAnchorTime) as UTCTimestamp,
      price: projectChartDecimal(marker.price),
      position: 'atPriceMiddle',
      shape: marker.role === 'entry' ? 'circle' : 'square',
      color: marker.role === 'entry' ? theme.drawingPrimary : theme.drawingSecondary,
      text: marker.role === 'entry' ? 'Entry' : 'Exit',
    }))
    .sort((left, right) => {
      const timeOrder = Number(left.time) - Number(right.time);
      return timeOrder || (left.id ?? '').localeCompare(right.id ?? '');
    });
}

/**
 * Binds Gate440's already-authoritative execution-marker projection to one
 * caller-owned Lightweight Charts v5 candle series. P17's existing timestamp
 * and decimal renderer conversion remains authoritative. The binding owns only
 * the vendor marker plugin lifecycle and categorical presentation mapping.
 */
export function createAnalysisSavedTradeLightweightChartsV5MarkerBinding(
  series: AnalysisSavedTradeMarkerSeries,
  createMarkers: AnalysisSavedTradeSeriesMarkersFactory = productionSeriesMarkersFactory,
): AnalysisSavedTradeLightweightChartsV5MarkerBinding {
  let plugin: AnalysisSavedTradeSeriesMarkersPlugin | null = null;
  let closed = false;

  const clear = (): void => {
    plugin?.setMarkers([]);
  };

  return {
    present(projection, theme) {
      if (closed) throw new Error('analysis-saved-trade-marker-binding-closed');

      if (projection.kind === 'unavailable') {
        clear();
        return Object.freeze({ kind: 'unavailable' as const, reason: projection.reason });
      }

      const markers = providerMarkers(projection, theme);
      if (plugin === null && markers.length > 0) {
        plugin = createMarkers(series, markers);
      } else if (plugin !== null) {
        plugin.setMarkers(markers);
      }

      return Object.freeze({
        kind: 'presented' as const,
        markerCount: markers.length,
        unplacedExecutions: projection.unplacedExecutions,
      });
    },
    close() {
      if (closed) return;
      closed = true;
      clear();
      plugin?.detach();
      plugin = null;
    },
  };
}
