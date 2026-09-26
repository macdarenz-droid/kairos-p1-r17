import { useEffect, useState } from 'react';
import type { BinanceSpot24hPublicRestBaselineObservedAtSource } from '../services/market-data';
import type {
  HomeDashboardLiveCryptoBubblePresentationStateObservation,
} from '../application/dashboard/homeDashboardLiveCryptoBubblePresentationStateObservationBridge';
import type { HomeDashboardLiveMarketSummaryFreshnessEvaluationTimeSource } from '../application/dashboard/homeDashboardLiveMarketSummaryFreshnessObservationBridge';
import {
  startBinanceHomeDashboardLiveCryptoBubblePresentationObservedRuntime,
  type BinanceHomeDashboardLiveCryptoBubblePresentationObservedRuntimeCompositionOptions,
} from './binanceHomeDashboardLiveCryptoBubblePresentationObservedRuntimeComposition';

export type HomeDashboardLiveCryptoBubbleReactRuntimeStatus =
  | 'starting'
  | 'running'
  | 'acquisition-failed'
  | 'bootstrap-error';

export interface HomeDashboardLiveCryptoBubbleReactRuntimeState {
  readonly status: HomeDashboardLiveCryptoBubbleReactRuntimeStatus;
  readonly latestObservation: HomeDashboardLiveCryptoBubblePresentationStateObservation | null;
  readonly lastError: unknown | null;
}

export interface HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions
  extends Omit<
    BinanceHomeDashboardLiveCryptoBubblePresentationObservedRuntimeCompositionOptions,
    'observationSink'
  > {}

const INITIAL_STATE: HomeDashboardLiveCryptoBubbleReactRuntimeState = {
  status: 'starting',
  latestObservation: null,
  lastError: null,
};

/**
 * React lifecycle/state binding for the canonically released Gate350 Binance Home
 * Bubble semantic observed runtime. Provider, universe, freshness, metric and
 * presentation-policy truth stay caller-owned; this hook only starts/closes the
 * released runtime and preserves its exact semantic observation/error evidence.
 */
export function useHomeDashboardLiveCryptoBubblePresentationObservedRuntime(
  readObservedAt: BinanceSpot24hPublicRestBaselineObservedAtSource,
  readEvaluationTimeMs: HomeDashboardLiveMarketSummaryFreshnessEvaluationTimeSource,
  options: HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions,
): HomeDashboardLiveCryptoBubbleReactRuntimeState {
  const [state, setState] = useState<HomeDashboardLiveCryptoBubbleReactRuntimeState>(INITIAL_STATE);

  useEffect(() => {
    let active = true;
    let closeRuntime: (() => void) | null = null;

    setState(INITIAL_STATE);

    async function bootstrap(): Promise<void> {
      try {
        const result = await startBinanceHomeDashboardLiveCryptoBubblePresentationObservedRuntime(
          readObservedAt,
          readEvaluationTimeMs,
          {
            universe: options.universe,
            lifecycle: options.lifecycle,
            presentationPolicy: options.presentationPolicy,
            observationSink: {
              onObservation(observation) {
                if (!active) return;
                setState((current) => ({ ...current, latestObservation: observation }));
              },
              onError(error) {
                if (!active) return;
                setState((current) => ({ ...current, lastError: error }));
              },
            },
          },
        );

        if (!active) {
          if (result.ok) result.runtime.close();
          return;
        }
        if (!result.ok) {
          setState((current) => ({ ...current, status: 'acquisition-failed' }));
          return;
        }
        closeRuntime = result.runtime.close;
        setState((current) => ({ ...current, status: 'running' }));
      } catch (error: unknown) {
        if (!active) return;
        setState((current) => ({ ...current, status: 'bootstrap-error', lastError: error }));
      }
    }

    void bootstrap();

    return () => {
      active = false;
      closeRuntime?.();
    };
  }, [
    readObservedAt,
    readEvaluationTimeMs,
    // Configured callers recreate wrapper objects during runtime state updates.
    // Restart only for changed caller inputs, never for those wrapper identities.
    options.universe.excludedStablecoinBaseAssets,
    options.universe.topNCount,
    options.universe.signal,
    options.lifecycle?.document,
    options.lifecycle?.timer,
    options.presentationPolicy.neutralMaxAbsoluteMovementPercent,
  ]);

  return state;
}
