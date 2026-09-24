import { useCallback, useContext, useMemo, useState, type ComponentType } from 'react';
import type { JournalHistoryEntry } from '../application/journal';
import { getChartTheme, useTheme } from '../design-system/themes';
import type { MarketCandle, MarketCandleHistorySnapshot } from '../services/market-data/MarketCandleHistoryPort';
import type { MarketDataInstrument } from '../services/market-data/marketDataTypes';
import {
  AnalysisLiveCandleCanvas,
  type AnalysisLiveCandleCanvasProps,
} from './AnalysisLiveCandleCanvas';
import { AnalysisSavedTradeMarkerEvidencePresentation } from './AnalysisSavedTradeMarkerEvidencePresentation';
import { AnalysisSavedTradeRiskRewardEvidencePresentation } from './AnalysisSavedTradeRiskRewardEvidencePresentation';
import { AnalysisOverlaySessionFactoryContext, AnalysisTradeWindowContext } from './analysisDrawingToolsContext';
import {
  createAnalysisCandleRendererSession,
  type AnalysisCandleRendererSessionInput,
} from './analysisCandleRendererSession';
import { createAnalysisLiveCandleRouteSession } from './analysisLiveCandleRouteSession';
import { projectAnalysisSavedTradeRiskRewardSnapshotExtent } from './analysisSavedTradeRiskRewardSnapshotExtentProjection';
import { createAnalysisSavedTradeRiskRewardThemeStyleSource } from './analysisSavedTradeRiskRewardThemeStyleSource';
import {
  useAnalysisSavedTradeOverlayPresentationSession,
  type AnalysisSavedTradeOverlayReactBindingOptions,
  type AnalysisSavedTradeOverlayReactBindingResult,
} from './useAnalysisSavedTradeOverlayPresentationSession';

export interface AnalysisSavedTradeOverlayLiveCandleCanvasProps {
  readonly entry: JournalHistoryEntry;
  readonly instrument: MarketDataInstrument;
  readonly interval: string;
  readonly quoteAsset: string;
  readonly revision?: number;
  readonly LiveCanvas?: ComponentType<AnalysisLiveCandleCanvasProps>;
  readonly useOverlayBinding?: (
    options: AnalysisSavedTradeOverlayReactBindingOptions,
  ) => AnalysisSavedTradeOverlayReactBindingResult;
  readonly createLiveSession?: typeof createAnalysisLiveCandleRouteSession;
  readonly createRendererSession?: typeof createAnalysisCandleRendererSession;
  /** Optional released overlay session factory from a higher composition (for example one carrying a drawing-binding lifecycle); defaults to the workspace context. */
  readonly createOverlaySession?: AnalysisSavedTradeOverlayReactBindingOptions['createSession'];
}

interface ScopedSnapshot {
  readonly key: string;
  readonly snapshot: MarketCandleHistorySnapshot | null;
}

interface ScopedLatestCandle {
  readonly key: string;
  readonly candle: MarketCandle | null;
}

const selectionKey = (
  instrument: MarketDataInstrument,
  interval: string,
  revision: number,
): string => [instrument.venue, instrument.symbol, interval, revision].join('\u0000');

/**
 * Unmounted composition boundary between Gate460's shared saved-trade overlay
 * lifecycle and the released live-candle canvas. The overlay supplies only its
 * exact renderer factory; the live owner supplies the authoritative history
 * snapshot. Risk/Reward presentation is deferred until Gate463 accepts that
 * exact snapshot extent, while Gate462 resolves style from the active theme.
 */
export function AnalysisSavedTradeOverlayLiveCandleCanvas({
  entry,
  instrument,
  interval,
  quoteAsset,
  revision = 0,
  LiveCanvas = AnalysisLiveCandleCanvas,
  useOverlayBinding = useAnalysisSavedTradeOverlayPresentationSession,
  createLiveSession = createAnalysisLiveCandleRouteSession,
  createRendererSession = createAnalysisCandleRendererSession,
  createOverlaySession,
}: AnalysisSavedTradeOverlayLiveCandleCanvasProps) {
  const { themeId } = useTheme();
  const contextOverlaySession = useContext(AnalysisOverlaySessionFactoryContext);
  const initialWindow = useContext(AnalysisTradeWindowContext);
  const overlaySession = createOverlaySession ?? contextOverlaySession ?? undefined;
  const key = selectionKey(instrument, interval, revision);
  const [scopedSnapshot, setScopedSnapshot] = useState<ScopedSnapshot>({ key, snapshot: null });
  const snapshot = scopedSnapshot.key === key ? scopedSnapshot.snapshot : null;
  const [scopedLatestCandle, setScopedLatestCandle] = useState<ScopedLatestCandle>({ key, candle: null });
  const latestCandle = scopedLatestCandle.key === key ? scopedLatestCandle.candle : null;
  // The live projection's last rendered close wins; before any live render the authoritative page's last close stands in.
  const historyLastClose = snapshot?.candles.at(-1)?.close ?? null;
  const lastClose = latestCandle?.close ?? historyLastClose;
  const lastCloseSource = latestCandle !== null ? 'live' : historyLastClose !== null ? 'history' : null;
  const scope = useMemo(() => ({ instrument, quoteAsset }), [instrument.venue, instrument.symbol, quoteAsset]);
  const theme = useMemo(() => getChartTheme(themeId), [themeId]);
  const styleSource = useMemo(
    () => createAnalysisSavedTradeRiskRewardThemeStyleSource(themeId),
    [themeId],
  );
  const extentProjection = useMemo(
    () => snapshot === null
      ? null
      : projectAnalysisSavedTradeRiskRewardSnapshotExtent(snapshot, { instrument, interval }),
    [instrument.symbol, instrument.venue, interval, snapshot],
  );
  const extent = extentProjection?.kind === 'extent-ready' ? extentProjection.extent : null;
  const overlay = useOverlayBinding({
    entry,
    scope,
    snapshot,
    theme,
    extent,
    styleSource,
    revision,
    ...(overlaySession === undefined ? {} : { createSession: overlaySession }),
  });

  const publishLatestCandle = useCallback((next: MarketCandle | null) => {
    setScopedLatestCandle({ key, candle: next });
  }, [key]);

  const publishSnapshot = useCallback((next: MarketCandleHistorySnapshot | null) => {
    setScopedSnapshot({ key, snapshot: next });
  }, [key]);

  const createSession = useMemo(() => {
    const rendererFactory = overlay.rendererFactory;
    if (rendererFactory === null) return null;
    return () => createLiveSession({
      createRendererSession(input: AnalysisCandleRendererSessionInput) {
        return createRendererSession({ ...input, factory: rendererFactory, ...(initialWindow === null ? {} : { initialWindow }) });
      },
    });
  }, [createLiveSession, createRendererSession, overlay.rendererFactory, initialWindow]);

  const evidence = <AnalysisSavedTradeMarkerEvidencePresentation
    presentation={overlay.presentation?.markers ?? null}
    lastError={overlay.markerError}
    quoteAsset={quoteAsset}
  />;
  const positionBox = <AnalysisSavedTradeRiskRewardEvidencePresentation
    presentation={overlay.presentation?.riskReward ?? null}
    lastError={overlay.riskRewardError}
    symbol={instrument.symbol}
    quoteAsset={quoteAsset}
    lastClose={lastClose}
    lastCloseSource={lastCloseSource}
  />;

  if (createSession === null) return <>{positionBox}{evidence}</>;
  return <>
    <LiveCanvas
      instrument={instrument}
      interval={interval}
      quoteAsset={quoteAsset}
      revision={revision}
      createSession={createSession}
      onAuthoritativeSnapshot={publishSnapshot}
      onLatestCandle={publishLatestCandle}
    />
    {positionBox}
    {evidence}
  </>;
}
