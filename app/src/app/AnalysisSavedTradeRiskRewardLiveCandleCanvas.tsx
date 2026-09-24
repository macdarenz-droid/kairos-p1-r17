import { useMemo, type ComponentType } from 'react';
import type { JournalHistoryEntry } from '../application/journal';
import type { ChartTimestamp } from '../features/chart';
import type { MarketDataInstrument } from '../services/market-data/marketDataTypes';
import {
  AnalysisLiveCandleCanvas,
  type AnalysisLiveCandleCanvasProps,
} from './AnalysisLiveCandleCanvas';
import {
  createAnalysisCandleRendererSession,
  type AnalysisCandleRendererSessionInput,
} from './analysisCandleRendererSession';
import { createAnalysisLiveCandleRouteSession } from './analysisLiveCandleRouteSession';
import type { AnalysisSavedTradeRiskRewardCanvasStyleSource } from './analysisSavedTradeRiskRewardCanvasPaneRenderer';
import {
  useAnalysisSavedTradeRiskRewardPresentationSession,
  type AnalysisSavedTradeRiskRewardReactBindingOptions,
  type AnalysisSavedTradeRiskRewardReactBindingResult,
} from './useAnalysisSavedTradeRiskRewardPresentationSession';

export interface AnalysisSavedTradeRiskRewardLiveCandleCanvasProps {
  readonly entry: JournalHistoryEntry;
  readonly instrument: MarketDataInstrument;
  readonly interval: string;
  readonly quoteAsset: string;
  readonly extent: Readonly<{ readonly start: ChartTimestamp; readonly end: ChartTimestamp }>;
  readonly styleSource: AnalysisSavedTradeRiskRewardCanvasStyleSource;
  readonly revision?: number;
  readonly LiveCanvas?: ComponentType<AnalysisLiveCandleCanvasProps>;
  readonly useRiskRewardBinding?: (
    options: AnalysisSavedTradeRiskRewardReactBindingOptions,
  ) => AnalysisSavedTradeRiskRewardReactBindingResult;
  readonly createLiveSession?: typeof createAnalysisLiveCandleRouteSession;
  readonly createRendererSession?: typeof createAnalysisCandleRendererSession;
}

/**
 * Unmounted composition boundary between Gate456's exact saved-trade
 * Risk/Reward lifecycle and the released live-candle canvas. The Risk/Reward
 * owner supplies only its renderer factory; the live owner retains all
 * acquisition, provider, selected-scope and renderer-lifecycle authority.
 */
export function AnalysisSavedTradeRiskRewardLiveCandleCanvas({
  entry,
  instrument,
  interval,
  quoteAsset,
  extent,
  styleSource,
  revision = 0,
  LiveCanvas = AnalysisLiveCandleCanvas,
  useRiskRewardBinding = useAnalysisSavedTradeRiskRewardPresentationSession,
  createLiveSession = createAnalysisLiveCandleRouteSession,
  createRendererSession = createAnalysisCandleRendererSession,
}: AnalysisSavedTradeRiskRewardLiveCandleCanvasProps) {
  const scope = useMemo(() => ({ instrument, quoteAsset }), [instrument.venue, instrument.symbol, quoteAsset]);
  const riskReward = useRiskRewardBinding({ entry, scope, extent, styleSource, revision });

  const createSession = useMemo(() => {
    const rendererFactory = riskReward.rendererFactory;
    if (rendererFactory === null) return null;
    return () => createLiveSession({
      createRendererSession(input: AnalysisCandleRendererSessionInput) {
        return createRendererSession({ ...input, factory: rendererFactory });
      },
    });
  }, [createLiveSession, createRendererSession, riskReward.rendererFactory]);

  if (createSession === null) return null;
  return <LiveCanvas
    instrument={instrument}
    interval={interval}
    quoteAsset={quoteAsset}
    revision={revision}
    createSession={createSession}
  />;
}
