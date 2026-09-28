import { useEffect, useRef, useState } from 'react';
import type { JournalHistoryEntry } from '../application/journal';
import type { ChartTheme } from '../design-system/themes/chartThemeAdapter';
import type { ChartTimestamp } from '../features/chart';
import type { MarketCandleHistorySnapshot } from '../services/market-data/MarketCandleHistoryPort';
import type { AnalysisCandleRendererFactory } from './analysisCandleRendererSession';
import type { AnalysisSavedTradeChartReferenceScope } from './analysisSavedTradeChartReferenceProjection';
import type { AnalysisSavedTradeRiskRewardCanvasStyleSource } from './analysisSavedTradeRiskRewardCanvasPaneRenderer';
import {
  createAnalysisSavedTradeOverlayPresentationSession,
  type AnalysisSavedTradeOverlayPresentation,
  type AnalysisSavedTradeOverlayPresentationSession,
} from './analysisSavedTradeOverlayPresentationSession';

export interface AnalysisSavedTradeOverlayReactBindingOptions {
  readonly entry: JournalHistoryEntry;
  readonly scope: AnalysisSavedTradeChartReferenceScope;
  /** Exact successful history snapshot already owned by the live-candle lifecycle. */
  readonly snapshot: MarketCandleHistorySnapshot | null;
  readonly theme: ChartTheme;
  /**
   * Exact caller-authoritative chart extent. Null keeps the shared renderer
   * available while deferring only Risk/Reward projection until history exists.
   */
  readonly extent: Readonly<{ readonly start: ChartTimestamp; readonly end: ChartTimestamp }> | null;
  readonly styleSource: AnalysisSavedTradeRiskRewardCanvasStyleSource;
  /** Caller-owned refresh key for unchanged evidence object identities. */
  readonly revision?: number;
  readonly createSession?: typeof createAnalysisSavedTradeOverlayPresentationSession;
}

export interface AnalysisSavedTradeOverlayReactBindingResult {
  /** Stable Gate459 renderer factory for the later live-candle composition. */
  readonly rendererFactory: AnalysisCandleRendererFactory | null;
  /** Latest exact accepted Gate459 snapshot; lower-owner failures never replace it. */
  readonly presentation: AnalysisSavedTradeOverlayPresentation | null;
  readonly markerError: unknown | null;
  readonly riskRewardError: unknown | null;
}

const initialState = (): AnalysisSavedTradeOverlayReactBindingResult => ({
  rendererFactory: null,
  presentation: null,
  markerError: null,
  riskRewardError: null,
});

/**
 * Owns one Gate459 application session for one mounted hook. Marker and
 * Risk/Reward evidence are delegated independently through that same session;
 * each accepted result refreshes the exact aggregate presentation while a
 * rejected lower-owner update preserves the last accepted snapshot.
 */
export function useAnalysisSavedTradeOverlayPresentationSession({
  entry,
  scope,
  snapshot,
  theme,
  extent,
  styleSource,
  revision = 0,
  createSession = createAnalysisSavedTradeOverlayPresentationSession,
}: AnalysisSavedTradeOverlayReactBindingOptions): AnalysisSavedTradeOverlayReactBindingResult {
  const session = useRef<AnalysisSavedTradeOverlayPresentationSession | null>(null);
  const [state, setState] = useState<AnalysisSavedTradeOverlayReactBindingResult>(initialState);
  const extentStart = extent === null ? null : extent.start;
  const extentEnd = extent === null ? null : extent.end;

  useEffect(() => {
    let created: AnalysisSavedTradeOverlayPresentationSession;
    try {
      created = createSession();
    } catch (error: unknown) {
      setState({ ...initialState(), markerError: error, riskRewardError: error });
      return;
    }
    session.current = created;
    setState({
      rendererFactory: created.rendererFactory,
      presentation: null,
      markerError: null,
      riskRewardError: null,
    });
    return () => {
      if (session.current === created) session.current = null;
      created.close();
    };
  }, [createSession]);

  useEffect(() => {
    const current = session.current;
    if (!current || snapshot === null) return;
    try {
      current.presentMarkers({ entry, scope, snapshot, theme });
      const presentation = current.presentation();
      if (session.current === current) {
        setState(value => ({ ...value, presentation, markerError: null }));
      }
    } catch (error: unknown) {
      if (session.current === current) {
        setState(value => ({ ...value, markerError: error }));
      }
    }
  }, [
    createSession,
    entry,
    revision,
    scope.instrument.symbol,
    scope.instrument.venue,
    scope.quoteAsset,
    snapshot,
    theme,
  ]);

  useEffect(() => {
    const current = session.current;
    if (!current || extent === null) return;
    try {
      current.presentRiskReward({ entry, scope, extent, styleSource });
      const presentation = current.presentation();
      if (session.current === current) {
        setState(value => ({ ...value, presentation, riskRewardError: null }));
      }
    } catch (error: unknown) {
      if (session.current === current) {
        setState(value => ({ ...value, riskRewardError: error }));
      }
    }
  }, [
    createSession,
    entry,
    extentEnd,
    extentStart,
    revision,
    scope.instrument.symbol,
    scope.instrument.venue,
    scope.quoteAsset,
    styleSource,
  ]);

  return state;
}
