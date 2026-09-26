import { createSeriesMarkers } from 'lightweight-charts';
import type { ISeriesApi, ISeriesMarkersPluginApi, SeriesMarker, Time, UTCTimestamp } from 'lightweight-charts';
import type { TimeAssistedTradeSnapshot } from '../application/market-reference';
import type { ChartTheme } from '../design-system/themes/chartThemeAdapter';
import { projectChartTimestamp } from '../features/chart/chartSeriesProjection';

export type AnalysisTimeAssistedMarkerSeries = ISeriesApi<'Candlestick', Time>;

export interface AnalysisTimeAssistedSeriesMarkersPlugin {
  setMarkers(markers: SeriesMarker<Time>[]): void;
  detach(): void;
}

export type AnalysisTimeAssistedSeriesMarkersFactory = (series: AnalysisTimeAssistedMarkerSeries, markers: SeriesMarker<Time>[]) => AnalysisTimeAssistedSeriesMarkersPlugin;

export type AnalysisTimeAssistedMarkerPresentation =
  | { readonly kind: 'cleared' }
  | { readonly kind: 'presented'; readonly markerCount: number; readonly unplaced: readonly ('entry' | 'exit')[] };

export interface AnalysisTimeAssistedMarkerBinding {
  present(snapshot: TimeAssistedTradeSnapshot | null, theme: ChartTheme): AnalysisTimeAssistedMarkerPresentation;
  close(): void;
}

const productionFactory: AnalysisTimeAssistedSeriesMarkersFactory = (series, markers) => createSeriesMarkers(series, markers) as ISeriesMarkersPluginApi<Time>;

/**
 * Estimated markers sit on the containing candle (its open time) and carry no
 * price: a candle-range estimate has no single price to place, so the marker
 * is anchored above or below the bar and labelled as an estimate.
 */
export function projectAnalysisTimeAssistedMarkers(snapshot: TimeAssistedTradeSnapshot, theme: ChartTheme): { readonly markers: SeriesMarker<Time>[]; readonly unplaced: readonly ('entry' | 'exit')[] } {
  const markers: SeriesMarker<Time>[] = [];
  const unplaced: ('entry' | 'exit')[] = [];
  const entryBelow = snapshot.side === 'long';
  const place = (role: 'entry' | 'exit', estimate: TimeAssistedTradeSnapshot['opening']) => {
    if (estimate.kind !== 'candle-range') { unplaced.push(role); return; }
    const below = role === 'entry' ? entryBelow : !entryBelow;
    markers.push({
      id: `time-assisted:${role}`,
      time: projectChartTimestamp(estimate.candle.openTime) as UTCTimestamp,
      position: below ? 'belowBar' : 'aboveBar',
      shape: below ? 'arrowUp' : 'arrowDown',
      color: role === 'entry' ? theme.drawingPrimary : theme.drawingSecondary,
      text: role === 'entry' ? 'Est. entry' : 'Est. exit',
    });
  };
  place('entry', snapshot.opening);
  if (snapshot.closing !== null) place('exit', snapshot.closing);
  markers.sort((left, right) => Number(left.time) - Number(right.time) || (left.id ?? '').localeCompare(right.id ?? ''));
  return { markers, unplaced };
}

export function createAnalysisTimeAssistedMarkerBinding(series: AnalysisTimeAssistedMarkerSeries, createMarkers: AnalysisTimeAssistedSeriesMarkersFactory = productionFactory): AnalysisTimeAssistedMarkerBinding {
  let plugin: AnalysisTimeAssistedSeriesMarkersPlugin | null = null;
  let closed = false;
  return {
    present(snapshot, theme) {
      if (closed) throw new Error('analysis-time-assisted-marker-binding-closed');
      if (snapshot === null) { plugin?.setMarkers([]); return Object.freeze({ kind: 'cleared' as const }); }
      const { markers, unplaced } = projectAnalysisTimeAssistedMarkers(snapshot, theme);
      if (plugin === null && markers.length > 0) plugin = createMarkers(series, markers);
      else if (plugin !== null) plugin.setMarkers(markers);
      return Object.freeze({ kind: 'presented' as const, markerCount: markers.length, unplaced: Object.freeze([...unplaced]) });
    },
    close() {
      if (closed) return;
      closed = true;
      const previous = plugin; plugin = null;
      previous?.setMarkers([]); previous?.detach();
    },
  };
}
