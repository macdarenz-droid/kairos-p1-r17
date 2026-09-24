import { getChartTheme, type ThemeId } from '../design-system/themes';
import { createLightweightChartsV5ProductionRendererFactory, type LightweightChartsV5ProductionCandlestickSeriesLifecycle, type LightweightChartsV5ProductionDrawingBindingLifecycle } from '../features/chart/lightweightChartsV5ProductionRenderer';
import { composeCandlestickSeriesLifecycles } from './analysisTimeAssistedMarkerSession';
import { createAnalysisCandleRendererSession } from './analysisCandleRendererSession';
import { createAnalysisDrawingToolsRendererSession, type AnalysisDrawingToolsRendererSession, type AnalysisDrawingToolsRendererSessionOptions } from './analysisDrawingToolsRendererSession';
import { ANALYSIS_DRAWING_ENDPOINT_EDIT_TOLERANCE_PX, ANALYSIS_DRAWING_TREND_LINE_WIDTH } from './analysisLiveCandleProductPolicy';
import { createAnalysisLiveCandleRouteSession } from './analysisLiveCandleRouteSession';
import { createAnalysisSavedTradeOverlayPresentationSession, type AnalysisSavedTradeOverlayPresentationSession } from './analysisSavedTradeOverlayPresentationSession';
import { createAnalysisSavedTradeOverlayRendererSession } from './analysisSavedTradeOverlayRendererSession';

/** Stroke style for the Analysis trend-line tool: the active chart theme's drawing token and the product width. */
export function resolveAnalysisDrawingToolsStyle(themeId: ThemeId): AnalysisDrawingToolsRendererSessionOptions['style'] {
  return Object.freeze({ color: getChartTheme(themeId).drawingPrimary, lineWidth: ANALYSIS_DRAWING_TREND_LINE_WIDTH });
}

/** One drawing-tools session for one Analysis selection; the caller owns its lifetime. */
export function createAnalysisDrawingToolsSession(
  themeId: ThemeId,
  listeners: Pick<AnalysisDrawingToolsRendererSessionOptions, 'onStateChange' | 'onDrawingsChange'> = {},
): AnalysisDrawingToolsRendererSession {
  return createAnalysisDrawingToolsRendererSession({ style: resolveAnalysisDrawingToolsStyle(themeId), endpointEditTolerancePx: ANALYSIS_DRAWING_ENDPOINT_EDIT_TOLERANCE_PX, ...listeners });
}

/**
 * Base live canvas path: the released route session with the released renderer
 * session, whose production factory also carries the drawing-binding lifecycle.
 */
export function createAnalysisDrawingToolsLiveSessionFactory(
  lifecycle: LightweightChartsV5ProductionDrawingBindingLifecycle,
  seriesLifecycle?: LightweightChartsV5ProductionCandlestickSeriesLifecycle,
): typeof createAnalysisLiveCandleRouteSession {
  return (dependencies = {}) => createAnalysisLiveCandleRouteSession({
    ...dependencies,
    createRendererSession: input => (dependencies.createRendererSession ?? createAnalysisCandleRendererSession)({
      ...input,
      factory: input.factory ?? createLightweightChartsV5ProductionRendererFactory(seriesLifecycle, lifecycle),
    }),
  });
}

/**
 * Saved-trade overlay path: the released overlay presentation session whose
 * shared renderer factory carries the released series lifecycle and the
 * drawing-binding lifecycle together, so markers, Risk/Reward and drawings
 * share one production renderer.
 */
export function createAnalysisDrawingToolsOverlaySessionFactory(
  lifecycle: LightweightChartsV5ProductionDrawingBindingLifecycle,
  seriesLifecycle?: LightweightChartsV5ProductionCandlestickSeriesLifecycle,
): () => AnalysisSavedTradeOverlayPresentationSession {
  return () => createAnalysisSavedTradeOverlayPresentationSession({
    createOverlayRendererSession: () => createAnalysisSavedTradeOverlayRendererSession({
      // The overlay's own series lifecycle (saved-trade markers, Risk/Reward) is fanned out with the caller's so both see the same candlestick series.
      createRendererFactory: overlaySeriesLifecycle => createLightweightChartsV5ProductionRendererFactory(seriesLifecycle === undefined ? overlaySeriesLifecycle : composeCandlestickSeriesLifecycles(overlaySeriesLifecycle, seriesLifecycle), lifecycle),
    }),
  });
}
