import { useEffect, useRef, useState } from 'react';
import type { JournalHistoryEntry } from '../application/journal';
import type { ChartTheme } from '../design-system/themes/chartThemeAdapter';
import type { MarketCandleHistorySnapshot } from '../services/market-data/MarketCandleHistoryPort';
import type { AnalysisCandleRendererFactory } from './analysisCandleRendererSession';
import type { AnalysisSavedTradeChartReferenceScope } from './analysisSavedTradeChartReferenceProjection';
import {
  createAnalysisSavedTradeMarkerPresentationSession,
  type AnalysisSavedTradeMarkerPresentationResult,
  type AnalysisSavedTradeMarkerPresentationSession,
} from './analysisSavedTradeMarkerPresentationSession';

export interface AnalysisSavedTradeMarkerReactBindingOptions {
  readonly entry: JournalHistoryEntry;
  readonly scope: AnalysisSavedTradeChartReferenceScope;
  /** The exact successful history snapshot already owned by the live-candle lifecycle. */
  readonly snapshot: MarketCandleHistorySnapshot | null;
  readonly theme: ChartTheme;
  /** Caller-owned refresh key for unchanged object identities. */
  readonly revision?: number;
  readonly createSession?: typeof createAnalysisSavedTradeMarkerPresentationSession;
}

export interface AnalysisSavedTradeMarkerReactBindingResult {
  /** Stable wrapper for the later live-candle renderer composition. */
  readonly rendererFactory: AnalysisCandleRendererFactory | null;
  /** Last complete released projection chain; never a partial replacement. */
  readonly presentation: AnalysisSavedTradeMarkerPresentationResult | null;
  readonly lastError: unknown | null;
}

const initialState = (): AnalysisSavedTradeMarkerReactBindingResult => ({
  rendererFactory: null,
  presentation: null,
  lastError: null,
});

/**
 * React lifetime and exact-input binding around Gate443. One released session
 * is created per mounted hook and closed once on unmount. The binding waits for
 * the caller's authoritative history snapshot, delegates all facts unchanged,
 * and retains the last complete result when a lower owner rejects ambiguity.
 */
export function useAnalysisSavedTradeMarkerPresentationSession({
  entry,
  scope,
  snapshot,
  theme,
  revision = 0,
  createSession = createAnalysisSavedTradeMarkerPresentationSession,
}: AnalysisSavedTradeMarkerReactBindingOptions): AnalysisSavedTradeMarkerReactBindingResult {
  const session = useRef<AnalysisSavedTradeMarkerPresentationSession | null>(null);
  const [state, setState] = useState<AnalysisSavedTradeMarkerReactBindingResult>(initialState);

  useEffect(() => {
    let created: AnalysisSavedTradeMarkerPresentationSession;
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
    if (!current || snapshot === null) return;
    try {
      const presentation = current.present({ entry, scope, snapshot, theme });
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
    revision,
    scope.instrument.symbol,
    scope.instrument.venue,
    scope.quoteAsset,
    snapshot,
    theme,
  ]);

  return state;
}
