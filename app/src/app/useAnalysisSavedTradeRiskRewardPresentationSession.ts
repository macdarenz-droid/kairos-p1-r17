import { useEffect, useRef, useState } from 'react';
import type { JournalHistoryEntry } from '../application/journal';
import type { ChartTimestamp } from '../features/chart';
import type { AnalysisCandleRendererFactory } from './analysisCandleRendererSession';
import type { AnalysisSavedTradeChartReferenceScope } from './analysisSavedTradeChartReferenceProjection';
import type { AnalysisSavedTradeRiskRewardCanvasStyleSource } from './analysisSavedTradeRiskRewardCanvasPaneRenderer';
import {
  createAnalysisSavedTradeRiskRewardPresentationSession,
  type AnalysisSavedTradeRiskRewardPresentationResult,
  type AnalysisSavedTradeRiskRewardPresentationSession,
} from './analysisSavedTradeRiskRewardPresentationSession';

export interface AnalysisSavedTradeRiskRewardReactBindingOptions {
  readonly entry: JournalHistoryEntry;
  readonly scope: AnalysisSavedTradeChartReferenceScope;
  readonly extent: Readonly<{ readonly start: ChartTimestamp; readonly end: ChartTimestamp }>;
  readonly styleSource: AnalysisSavedTradeRiskRewardCanvasStyleSource;
  /** Caller-owned refresh key for unchanged evidence object identities. */
  readonly revision?: number;
  readonly createSession?: typeof createAnalysisSavedTradeRiskRewardPresentationSession;
}

export interface AnalysisSavedTradeRiskRewardReactBindingResult {
  /** Stable wrapper for a later live-candle renderer composition. */
  readonly rendererFactory: AnalysisCandleRendererFactory | null;
  /** Last complete Gate455 chain; never a partial replacement. */
  readonly presentation: AnalysisSavedTradeRiskRewardPresentationResult | null;
  readonly lastError: unknown | null;
}

const initialState = (): AnalysisSavedTradeRiskRewardReactBindingResult => ({
  rendererFactory: null,
  presentation: null,
  lastError: null,
});

/**
 * React lifetime and exact-input binding around Gate455. One released session
 * is created per mounted hook and closed once on unmount. Every caller-owned
 * fact is delegated unchanged and the last complete result survives a lower
 * owner's rejection of ambiguous evidence.
 */
export function useAnalysisSavedTradeRiskRewardPresentationSession({
  entry,
  scope,
  extent,
  styleSource,
  revision = 0,
  createSession = createAnalysisSavedTradeRiskRewardPresentationSession,
}: AnalysisSavedTradeRiskRewardReactBindingOptions): AnalysisSavedTradeRiskRewardReactBindingResult {
  const session = useRef<AnalysisSavedTradeRiskRewardPresentationSession | null>(null);
  const [state, setState] = useState<AnalysisSavedTradeRiskRewardReactBindingResult>(initialState);

  useEffect(() => {
    let created: AnalysisSavedTradeRiskRewardPresentationSession;
    try {
      created = createSession();
    } catch (error: unknown) {
      setState({ ...initialState(), lastError: error });
      return;
    }
    session.current = created;
    setState({ rendererFactory: created.rendererFactory, presentation: null, lastError: null });
    return () => {
      if (session.current === created) session.current = null;
      created.close();
    };
  }, [createSession]);

  useEffect(() => {
    const current = session.current;
    if (!current) return;
    try {
      const presentation = current.present({ entry, scope, extent, styleSource });
      if (session.current === current) {
        setState(value => ({ ...value, presentation, lastError: null }));
      }
    } catch (error: unknown) {
      if (session.current === current) {
        setState(value => ({ ...value, lastError: error }));
      }
    }
  }, [
    createSession,
    entry,
    extent.end,
    extent.start,
    revision,
    scope.instrument.symbol,
    scope.instrument.venue,
    scope.quoteAsset,
    styleSource,
  ]);

  return state;
}
