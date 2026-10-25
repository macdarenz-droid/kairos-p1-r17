import type { JournalHistoryEntry } from '../application/journal';
import type { ChartTheme } from '../design-system/themes/chartThemeAdapter';
import type { ChartTimestamp } from '../features/chart';
import type { MarketCandleHistorySnapshot } from '../services/market-data/MarketCandleHistoryPort';
import type { AnalysisCandleRendererFactory } from './analysisCandleRendererSession';
import type { AnalysisSavedTradeChartReferenceScope } from './analysisSavedTradeChartReferenceProjection';
import type { AnalysisSavedTradeExecutionMarkerProjection } from './analysisSavedTradeExecutionMarkerProjection';
import {
  createAnalysisSavedTradeMarkerPresentationSession,
  type AnalysisSavedTradeMarkerPresentationResult,
  type AnalysisSavedTradeMarkerPresentationSession,
} from './analysisSavedTradeMarkerPresentationSession';
import {
  createAnalysisSavedTradeOverlayRendererSession,
  type AnalysisSavedTradeOverlayRendererPresentation,
  type AnalysisSavedTradeOverlayRendererSession,
} from './analysisSavedTradeOverlayRendererSession';
import type { AnalysisSavedTradeRendererMarkerSession } from './analysisSavedTradeRendererMarkerSession';
import type { AnalysisSavedTradeRiskRewardCanvasStyleSource } from './analysisSavedTradeRiskRewardCanvasPaneRenderer';
import type { AnalysisSavedTradeRiskRewardRendererProjection } from './analysisSavedTradeRiskRewardRendererProjection';
import {
  createAnalysisSavedTradeRiskRewardPresentationSession,
  type AnalysisSavedTradeRiskRewardPresentationResult,
  type AnalysisSavedTradeRiskRewardPresentationSession,
} from './analysisSavedTradeRiskRewardPresentationSession';
import type { AnalysisSavedTradeRiskRewardRendererSession } from './analysisSavedTradeRiskRewardRendererSession';

export interface AnalysisSavedTradeOverlayMarkerInput {
  readonly entry: JournalHistoryEntry;
  readonly scope: AnalysisSavedTradeChartReferenceScope;
  readonly snapshot: MarketCandleHistorySnapshot;
  readonly theme: ChartTheme;
}

export interface AnalysisSavedTradeOverlayRiskRewardInput {
  readonly entry: JournalHistoryEntry;
  readonly scope: AnalysisSavedTradeChartReferenceScope;
  readonly extent: Readonly<{ readonly start: ChartTimestamp; readonly end: ChartTimestamp }>;
  readonly styleSource: AnalysisSavedTradeRiskRewardCanvasStyleSource;
}

export interface AnalysisSavedTradeOverlayPresentation {
  readonly markers: AnalysisSavedTradeMarkerPresentationResult | null;
  readonly riskReward: AnalysisSavedTradeRiskRewardPresentationResult | null;
  readonly renderer: AnalysisSavedTradeOverlayRendererPresentation;
}

export interface AnalysisSavedTradeOverlayPresentationSession {
  readonly rendererFactory: AnalysisCandleRendererFactory;
  presentMarkers(input: AnalysisSavedTradeOverlayMarkerInput): AnalysisSavedTradeMarkerPresentationResult;
  presentRiskReward(input: AnalysisSavedTradeOverlayRiskRewardInput): AnalysisSavedTradeRiskRewardPresentationResult;
  presentation(): AnalysisSavedTradeOverlayPresentation;
  close(): void;
}

export interface AnalysisSavedTradeOverlayPresentationSessionDependencies {
  readonly createOverlayRendererSession?: () => AnalysisSavedTradeOverlayRendererSession;
  readonly createMarkerSession?: typeof createAnalysisSavedTradeMarkerPresentationSession;
  readonly createRiskRewardSession?: typeof createAnalysisSavedTradeRiskRewardPresentationSession;
}

/**
 * Reuses Gate443 and Gate455 as the exact marker and Risk/Reward application
 * projection owners while adapting both to Gate458's one shared renderer.
 * Inputs and completed lower-owner results remain independent; this session
 * adds no projection, provider, acquisition, persistence or UI responsibility.
 */
export function createAnalysisSavedTradeOverlayPresentationSession(
  dependencies: AnalysisSavedTradeOverlayPresentationSessionDependencies = {},
): AnalysisSavedTradeOverlayPresentationSession {
  const overlayRenderer = (dependencies.createOverlayRendererSession
    ?? createAnalysisSavedTradeOverlayRendererSession)();
  const createMarkerSession = dependencies.createMarkerSession
    ?? createAnalysisSavedTradeMarkerPresentationSession;
  const createRiskRewardSession = dependencies.createRiskRewardSession
    ?? createAnalysisSavedTradeRiskRewardPresentationSession;

  const markerRenderer: AnalysisSavedTradeRendererMarkerSession = Object.freeze({
    rendererFactory: overlayRenderer.rendererFactory,
    present: (projection: AnalysisSavedTradeExecutionMarkerProjection, theme: ChartTheme) => (
      overlayRenderer.presentMarkers(projection, theme)
    ),
    presentation: () => overlayRenderer.presentation().markers,
    close() {},
  });
  const riskRewardRenderer: AnalysisSavedTradeRiskRewardRendererSession = Object.freeze({
    rendererFactory: overlayRenderer.rendererFactory,
    present: (
      projection: AnalysisSavedTradeRiskRewardRendererProjection,
      styleSource: AnalysisSavedTradeRiskRewardCanvasStyleSource,
    ) => overlayRenderer.presentRiskReward(projection, styleSource),
    presentation: () => overlayRenderer.presentation().riskReward,
    close() {},
  });

  let markerSession: AnalysisSavedTradeMarkerPresentationSession | null = null;
  let riskRewardSession: AnalysisSavedTradeRiskRewardPresentationSession | null = null;
  try {
    markerSession = createMarkerSession({ createRendererMarkerSession: () => markerRenderer });
    if (markerSession.rendererFactory !== overlayRenderer.rendererFactory) {
      throw new Error('analysis-saved-trade-overlay-presentation-marker-renderer-factory-mismatch');
    }
    riskRewardSession = createRiskRewardSession({ createRendererSession: () => riskRewardRenderer });
    if (riskRewardSession.rendererFactory !== overlayRenderer.rendererFactory) {
      throw new Error('analysis-saved-trade-overlay-presentation-risk-reward-renderer-factory-mismatch');
    }
  } catch (error) {
    riskRewardSession?.close();
    markerSession?.close();
    overlayRenderer.close();
    throw error;
  }

  const markersOwner = markerSession;
  const riskRewardOwner = riskRewardSession;
  let markers: AnalysisSavedTradeMarkerPresentationResult | null = null;
  let riskReward: AnalysisSavedTradeRiskRewardPresentationResult | null = null;
  let closed = false;

  const snapshot = (): AnalysisSavedTradeOverlayPresentation => Object.freeze({
    markers,
    riskReward,
    renderer: overlayRenderer.presentation(),
  });

  return Object.freeze({
    rendererFactory: overlayRenderer.rendererFactory,
    presentMarkers(input: AnalysisSavedTradeOverlayMarkerInput) {
      if (closed) throw new Error('analysis-saved-trade-overlay-presentation-session-closed');
      const next = markersOwner.present(input);
      markers = next;
      return next;
    },
    presentRiskReward(input: AnalysisSavedTradeOverlayRiskRewardInput) {
      if (closed) throw new Error('analysis-saved-trade-overlay-presentation-session-closed');
      const next = riskRewardOwner.present(input);
      riskReward = next;
      return next;
    },
    presentation: snapshot,
    close() {
      if (closed) return;
      closed = true;
      markers = null;
      riskReward = null;
      riskRewardOwner.close();
      markersOwner.close();
      overlayRenderer.close();
    },
  });
}
