import type { JournalHistoryEntry } from '../application/journal';
import type { ChartTheme } from '../design-system/themes/chartThemeAdapter';
import type { AnalysisCandleRendererFactory } from './analysisCandleRendererSession';
import {
  projectAnalysisSavedTradeCandleWindow,
  type AnalysisSavedTradeCandleWindowProjection,
} from './analysisSavedTradeCandleWindowProjection';
import {
  projectAnalysisSavedTradeChartReference,
  type AnalysisSavedTradeChartReferenceProjection,
  type AnalysisSavedTradeChartReferenceScope,
} from './analysisSavedTradeChartReferenceProjection';
import {
  projectAnalysisSavedTradeExecutionMarkers,
  type AnalysisSavedTradeExecutionMarkerProjection,
} from './analysisSavedTradeExecutionMarkerProjection';
import {
  createAnalysisSavedTradeRendererMarkerSession,
  type AnalysisSavedTradeRendererMarkerSession,
  type AnalysisSavedTradeRendererMarkerSessionPresentation,
} from './analysisSavedTradeRendererMarkerSession';
import type { MarketCandleHistorySnapshot } from '../services/market-data/MarketCandleHistoryPort';

export interface AnalysisSavedTradeMarkerPresentationInput {
  readonly entry: JournalHistoryEntry;
  readonly scope: AnalysisSavedTradeChartReferenceScope;
  readonly snapshot: MarketCandleHistorySnapshot;
  readonly theme: ChartTheme;
}

export interface AnalysisSavedTradeMarkerPresentationResult {
  readonly reference: AnalysisSavedTradeChartReferenceProjection;
  readonly window: AnalysisSavedTradeCandleWindowProjection;
  readonly markers: AnalysisSavedTradeExecutionMarkerProjection;
  readonly presentation: AnalysisSavedTradeRendererMarkerSessionPresentation;
}

export interface AnalysisSavedTradeMarkerPresentationSession {
  readonly rendererFactory: AnalysisCandleRendererFactory;
  present(input: AnalysisSavedTradeMarkerPresentationInput): AnalysisSavedTradeMarkerPresentationResult;
  presentation(): AnalysisSavedTradeMarkerPresentationResult | null;
  close(): void;
}

export interface AnalysisSavedTradeMarkerPresentationSessionDependencies {
  readonly createRendererMarkerSession?: () => AnalysisSavedTradeRendererMarkerSession;
  readonly projectReference?: typeof projectAnalysisSavedTradeChartReference;
  readonly projectWindow?: typeof projectAnalysisSavedTradeCandleWindow;
  readonly projectMarkers?: typeof projectAnalysisSavedTradeExecutionMarkers;
}

/**
 * Composes the released saved-trade reference, candle-window and immutable
 * marker projections with Gate442's renderer-marker session. Every caller fact
 * and authoritative history snapshot is delegated unchanged; this owner adds
 * no request, persistence, arithmetic, venue claim or execution inference.
 */
export function createAnalysisSavedTradeMarkerPresentationSession(
  dependencies: AnalysisSavedTradeMarkerPresentationSessionDependencies = {},
): AnalysisSavedTradeMarkerPresentationSession {
  const rendererMarkerSession = (dependencies.createRendererMarkerSession
    ?? createAnalysisSavedTradeRendererMarkerSession)();
  const projectReference = dependencies.projectReference ?? projectAnalysisSavedTradeChartReference;
  const projectWindow = dependencies.projectWindow ?? projectAnalysisSavedTradeCandleWindow;
  const projectMarkers = dependencies.projectMarkers ?? projectAnalysisSavedTradeExecutionMarkers;
  let current: AnalysisSavedTradeMarkerPresentationResult | null = null;
  let closed = false;

  return {
    rendererFactory: rendererMarkerSession.rendererFactory,
    present(input) {
      if (closed) throw new Error('analysis-saved-trade-marker-presentation-session-closed');
      const reference = projectReference(input.entry, input.scope);
      const window = projectWindow(reference, input.snapshot);
      const markers = projectMarkers(window);
      const presentation = rendererMarkerSession.present(markers, input.theme);
      const next = Object.freeze({ reference, window, markers, presentation });
      current = next;
      return next;
    },
    presentation() {
      return current;
    },
    close() {
      if (closed) return;
      closed = true;
      current = null;
      rendererMarkerSession.close();
    },
  };
}
