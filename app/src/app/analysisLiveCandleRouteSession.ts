import { getChartTheme, type ThemeId } from '../design-system/themes';
import type { PresentedChartRenderer } from '../features/chart/lightweightChartsV5ProductionRenderer';
import type { MarketDataConnectionState, MarketDataInstrument } from '../services/market-data/marketDataTypes';
import { createAnalysisCandleRendererSession } from './analysisCandleRendererSession';
import {
  ANALYSIS_LIVE_CANDLE_HISTORY_LIMIT,
  ANALYSIS_LIVE_CANDLE_RECONNECT_POLICY,
} from './analysisLiveCandleProductPolicy';
import type { BinanceAnalysisHistoryLiveCandleBootstrapResult } from './binanceAnalysisHistoryLiveCandleBootstrapCoordination';
import type {
  BinanceAnalysisCandleBackfillRequest,
  BinanceAnalysisLiveCandleDisposition,
} from './binanceAnalysisLiveCandleProjectionRendererCoordination';
import type { BinanceAnalysisLiveCandleGapBackfillRecoveryResult } from './binanceAnalysisLiveCandleGapBackfillRecoveryCoordination';
import {
  createBinanceAnalysisLiveCandleProductionLifecycle,
} from './binanceAnalysisLiveCandleProductionLifecycle';
import type {
  BinanceAnalysisLiveCandleBrowserAvailability,
  BinanceAnalysisLiveCandleBrowserAvailabilityLifecycle,
  BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleResult,
  BinanceAnalysisLiveCandleBrowserAvailabilityObserver,
} from './binanceAnalysisLiveCandleBrowserAvailabilityLifecycle';

export interface AnalysisLiveCandleRouteSelection {
  readonly container: HTMLElement;
  readonly instrument: MarketDataInstrument;
  readonly interval: string;
  readonly themeId: ThemeId;
  readonly onAvailabilityChange?: (availability: BinanceAnalysisLiveCandleBrowserAvailability) => void;
  readonly onActivationResult?: (result: BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleResult) => void;
  readonly onStateChange?: (state: MarketDataConnectionState) => void;
  readonly onDisposition?: (disposition: BinanceAnalysisLiveCandleDisposition) => void;
  readonly onBackfillRequired?: (request: BinanceAnalysisCandleBackfillRequest) => void;
  readonly onBackfillRecovery?: (result: BinanceAnalysisLiveCandleGapBackfillRecoveryResult) => void;
  readonly onError?: (error: unknown) => void;
}

export interface AnalysisLiveCandleRouteSession {
  replace(selection: AnalysisLiveCandleRouteSelection): Promise<BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleResult>;
  setTheme(themeId: ThemeId): void;
  currentRenderer(): PresentedChartRenderer | null;
  availability(): BinanceAnalysisLiveCandleBrowserAvailability;
  isActive(): boolean;
  close(): void;
}

export interface AnalysisLiveCandleRouteSessionDependencies {
  readonly createLifecycle?: (
    observer: BinanceAnalysisLiveCandleBrowserAvailabilityObserver,
  ) => BinanceAnalysisLiveCandleBrowserAvailabilityLifecycle;
  readonly createRendererSession?: typeof createAnalysisCandleRendererSession;
}

/**
 * Route-level, non-React composition for one selected Analysis live-candle
 * session. It supplies the released product policy, creates the exact renderer
 * used by history and live updates, and owns that renderer's replacement and
 * cleanup. React mounting and visible status/copy remain later callers.
 */
export function createAnalysisLiveCandleRouteSession(
  dependencies: AnalysisLiveCandleRouteSessionDependencies = {},
): AnalysisLiveCandleRouteSession {
  const createRenderer = dependencies.createRendererSession ?? createAnalysisCandleRendererSession;
  let generation = 0;
  let selection: AnalysisLiveCandleRouteSelection | null = null;
  let renderer: PresentedChartRenderer | null = null;
  let themeId: ThemeId | null = null;
  let closed = false;

  const destroyRenderer = () => {
    const previous = renderer;
    renderer = null;
    previous?.destroy();
  };

  const failClosed = (ticket: number) => {
    if (ticket === generation) destroyRenderer();
  };

  const observer: BinanceAnalysisLiveCandleBrowserAvailabilityObserver = {
    onAvailabilityChange(availability) {
      selection?.onAvailabilityChange?.(availability);
    },
    onActivationResult(result) {
      const current = selection;
      if (!current) return;
      if (!result.ok) destroyRenderer();
      current.onActivationResult?.(result);
    },
  };

  const lifecycle = dependencies.createLifecycle
    ? dependencies.createLifecycle(observer)
    : createBinanceAnalysisLiveCandleProductionLifecycle({ availabilitySources: { observer } });

  return {
    async replace(next) {
      if (closed) return { ok: false, reason: 'superseded' };
      const ticket = ++generation;
      selection = next;
      themeId = next.themeId;

      const activation = lifecycle.replace({
        instrument: next.instrument,
        interval: next.interval,
        historyLimit: ANALYSIS_LIVE_CANDLE_HISTORY_LIMIT,
        reconnectPolicy: ANALYSIS_LIVE_CANDLE_RECONNECT_POLICY,
        renderHistory(snapshot) {
          if (ticket !== generation || closed) throw new Error('analysis-live-candle-route-session-superseded');
          destroyRenderer();
          const created = createRenderer({
            container: next.container,
            snapshot,
            themeId: themeId ?? next.themeId,
          });
          if (ticket !== generation || closed) {
            created.destroy();
            throw new Error('analysis-live-candle-route-session-superseded');
          }
          renderer = created;
          return created;
        },
        onStateChange(state) {
          if (ticket === generation) next.onStateChange?.(state);
        },
        onDisposition(disposition) {
          if (ticket === generation) next.onDisposition?.(disposition);
        },
        onBackfillRequired(request) {
          if (ticket === generation) next.onBackfillRequired?.(request);
        },
        onBackfillRecovery(recovery) {
          if (ticket !== generation) return;
          if (!recovery.ok) destroyRenderer();
          next.onBackfillRecovery?.(recovery);
        },
        onError(error) {
          if (ticket === generation) next.onError?.(error);
        },
      });
      // The released lifecycle synchronously invalidates/stops the previous
      // selected subscription before returning its activation promise.
      destroyRenderer();
      const result = await activation;

      if (ticket !== generation || closed) return { ok: false, reason: 'superseded' };
      if (!result.ok) failClosed(ticket);
      next.onActivationResult?.(result);
      return result;
    },
    setTheme(nextThemeId) {
      if (closed || selection === null) return;
      themeId = nextThemeId;
      renderer?.setTheme(getChartTheme(nextThemeId));
    },
    currentRenderer() {
      return renderer;
    },
    availability() {
      return lifecycle.availability();
    },
    isActive() {
      return !closed && lifecycle.isActive();
    },
    close() {
      if (closed) return;
      closed = true;
      generation += 1;
      selection = null;
      themeId = null;
      lifecycle.close();
      destroyRenderer();
    },
  };
}
