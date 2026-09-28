import { useCallback, useMemo, useState, type ComponentType } from 'react';
import type { JournalHistoryEntry } from '../application/journal';
import { getChartTheme, useTheme } from '../design-system/themes';
import type { MarketCandleHistorySnapshot } from '../services/market-data/MarketCandleHistoryPort';
import type { MarketDataInstrument } from '../services/market-data/marketDataTypes';
import {
  AnalysisLiveCandleCanvas,
  type AnalysisLiveCandleCanvasProps,
} from './AnalysisLiveCandleCanvas';
import { AnalysisSavedTradeMarkerEvidencePresentation } from './AnalysisSavedTradeMarkerEvidencePresentation';
import {
  createAnalysisCandleRendererSession,
  type AnalysisCandleRendererSessionInput,
} from './analysisCandleRendererSession';
import { createAnalysisLiveCandleRouteSession } from './analysisLiveCandleRouteSession';
import {
  useAnalysisSavedTradeMarkerPresentationSession,
  type AnalysisSavedTradeMarkerReactBindingOptions,
  type AnalysisSavedTradeMarkerReactBindingResult,
} from './useAnalysisSavedTradeMarkerPresentationSession';

export interface AnalysisSavedTradeLiveCandleCanvasProps {
  readonly entry: JournalHistoryEntry;
  readonly instrument: MarketDataInstrument;
  readonly interval: string;
  readonly quoteAsset: string;
  readonly revision?: number;
  readonly LiveCanvas?: ComponentType<AnalysisLiveCandleCanvasProps>;
  readonly useMarkerBinding?: (
    options: AnalysisSavedTradeMarkerReactBindingOptions,
  ) => AnalysisSavedTradeMarkerReactBindingResult;
  readonly createLiveSession?: typeof createAnalysisLiveCandleRouteSession;
  readonly createRendererSession?: typeof createAnalysisCandleRendererSession;
}

interface ScopedSnapshot {
  readonly key: string;
  readonly snapshot: MarketCandleHistorySnapshot | null;
}

const selectionKey = (
  instrument: MarketDataInstrument,
  interval: string,
  revision: number,
): string => `${instrument.venue}\u0000${instrument.symbol}\u0000${interval}\u0000${revision}`;

/**
 * Unmounted composition boundary between Gate444's exact saved-trade marker
 * lifecycle and the released live-candle canvas. The marker owner supplies the
 * renderer factory; the live owner returns the exact successful history page.
 * Neither side gains the other's acquisition, journal or financial ownership.
 */
export function AnalysisSavedTradeLiveCandleCanvas({
  entry,
  instrument,
  interval,
  quoteAsset,
  revision = 0,
  LiveCanvas = AnalysisLiveCandleCanvas,
  useMarkerBinding = useAnalysisSavedTradeMarkerPresentationSession,
  createLiveSession = createAnalysisLiveCandleRouteSession,
  createRendererSession = createAnalysisCandleRendererSession,
}: AnalysisSavedTradeLiveCandleCanvasProps) {
  const { themeId } = useTheme();
  const key = selectionKey(instrument, interval, revision);
  const [scopedSnapshot, setScopedSnapshot] = useState<ScopedSnapshot>({ key, snapshot: null });
  const snapshot = scopedSnapshot.key === key ? scopedSnapshot.snapshot : null;
  const scope = useMemo(() => ({ instrument, quoteAsset }), [instrument.venue, instrument.symbol, quoteAsset]);
  const theme = useMemo(() => getChartTheme(themeId), [themeId]);
  const marker = useMarkerBinding({ entry, scope, snapshot, theme, revision });

  const publishSnapshot = useCallback((next: MarketCandleHistorySnapshot | null) => {
    setScopedSnapshot({ key, snapshot: next });
  }, [key]);

  const createSession = useMemo(() => {
    const rendererFactory = marker.rendererFactory;
    if (rendererFactory === null) return null;
    return () => createLiveSession({
      createRendererSession(input: AnalysisCandleRendererSessionInput) {
        return createRendererSession({ ...input, factory: rendererFactory });
      },
    });
  }, [createLiveSession, createRendererSession, marker.rendererFactory]);

  const evidence = <AnalysisSavedTradeMarkerEvidencePresentation
    presentation={marker.presentation}
    lastError={marker.lastError}
    quoteAsset={quoteAsset}
  />;

  if (createSession === null) return evidence;
  return <>
    <LiveCanvas
      instrument={instrument}
      interval={interval}
      quoteAsset={quoteAsset}
      revision={revision}
      createSession={createSession}
      onAuthoritativeSnapshot={publishSnapshot}
    />
    {evidence}
  </>;
}
