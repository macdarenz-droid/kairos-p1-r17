import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import type { HomeDashboardLiveCryptoBubbleReactRuntimeState } from '../src/app/useHomeDashboardLiveCryptoBubblePresentationObservedRuntime';
import { projectHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel } from '../src/app/homeDashboardLiveCryptoBubbleReactAreaWeightViewModel';
import type { HomeDashboardLiveCryptoBubblePresentationStateProjectionResult } from '../src/application/dashboard/homeDashboardLiveCryptoBubblePresentationStateProjection';
import type { HomeDashboardLiveCryptoBubblePresentationStateObservation } from '../src/application/dashboard/homeDashboardLiveCryptoBubblePresentationStateObservationBridge';
import type { LiveMarketSummaryFact, MarketDataInstrument } from '../src/services/market-data/marketDataTypes';

const d = (value: string) => value as DecimalString;
const instrument = (symbol: string): MarketDataInstrument => ({ venue: 'binance-spot', symbol });

function fact(current: MarketDataInstrument, quoteVolume24h: DecimalString): LiveMarketSummaryFact {
  return {
    instrument: current,
    lastPrice: d('100'),
    open24h: d('100'),
    high24h: d('110'),
    low24h: d('90'),
    baseVolume24h: d('1000'),
    quoteVolume24h,
    observedAt: '2026-09-10T05:00:00.000Z',
    sourceTimestamp: null,
  };
}

function successfulPresentationState(volumes: readonly (DecimalString | null)[]): Extract<HomeDashboardLiveCryptoBubblePresentationStateProjectionResult, { ok: true }> {
  const entries = volumes.map((volume, index) => {
    const current = instrument(['BTCUSDT', 'ETHUSDT', 'SOLUSDT'][index] ?? `T${index}USDT`);
    if (volume === null) {
      return {
        metricInput: { instrument: current, fact: null, ageMs: null, freshness: null, quoteVolume24h: null, movementPercent24h: null },
        availability: 'missing' as const,
        movementSemantic: null,
        freshnessState: 'missing' as const,
      };
    }
    const currentFact = fact(current, volume);
    return {
      metricInput: { instrument: current, fact: currentFact, ageMs: 1000, freshness: 'fresh' as const, quoteVolume24h: volume, movementPercent24h: d('1') },
      availability: 'present' as const,
      movementSemantic: 'positive' as const,
      freshnessState: 'fresh' as const,
    };
  });

  return {
    ok: true,
    metricObservation: { freshnessObservation: {} as never, bubbleMetricProjection: { ok: true, evaluationTimeMs: 1, entries: entries.map((entry) => entry.metricInput) } },
    entries,
  };
}

function runtimeState(
  status: HomeDashboardLiveCryptoBubbleReactRuntimeState['status'],
  observation: HomeDashboardLiveCryptoBubblePresentationStateObservation | null,
  lastError: unknown | null = null,
): HomeDashboardLiveCryptoBubbleReactRuntimeState {
  return { status, latestObservation: observation, lastError };
}

describe('Home Dashboard Live Crypto Bubble React area-weight view-model foundation', () => {
  it('preserves exact Gate351 runtime state and exposes no fabricated area weights before the first observation', () => {
    const state = runtimeState('starting', null);
    const result = projectHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel(state);

    expect(result.runtimeState).toBe(state);
    expect(result.areaWeightProjection).toBeNull();
  });

  it('derives released Gate352 area weights from the exact latest semantic projection while preserving runtime-state identity', () => {
    const presentationStateProjection = successfulPresentationState([d('100'), d('25'), null]);
    const observation: HomeDashboardLiveCryptoBubblePresentationStateObservation = {
      metricObservation: presentationStateProjection.metricObservation,
      presentationStateProjection,
    };
    const state = runtimeState('running', observation);
    const result = projectHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel(state);

    expect(result.runtimeState).toBe(state);
    expect(result.areaWeightProjection?.ok).toBe(true);
    if (result.areaWeightProjection?.ok !== true) return;
    expect(result.areaWeightProjection.presentationStateProjection).toBe(presentationStateProjection);
    expect(result.areaWeightProjection.entries.map((entry) => entry.areaWeight)).toEqual([d('1'), d('0.25'), null]);
    result.areaWeightProjection.entries.forEach((entry, index) => {
      expect(entry.presentationEntry).toBe(presentationStateProjection.entries[index]);
    });
  });

  it('keeps the last authoritative area-weight evidence available when acquisition later fails', () => {
    const presentationStateProjection = successfulPresentationState([d('10'), d('5')]);
    const observation: HomeDashboardLiveCryptoBubblePresentationStateObservation = {
      metricObservation: presentationStateProjection.metricObservation,
      presentationStateProjection,
    };
    const error = new Error('later acquisition failed');
    const state = runtimeState('acquisition-failed', observation, error);
    const result = projectHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel(state);

    expect(result.runtimeState).toBe(state);
    expect(result.runtimeState.lastError).toBe(error);
    expect(result.areaWeightProjection?.ok).toBe(true);
    if (result.areaWeightProjection?.ok !== true) return;
    expect(result.areaWeightProjection.entries.map((entry) => entry.areaWeight)).toEqual([d('1'), d('0.5')]);
  });

  it('preserves bootstrap error state without fabricating area-weight evidence when no observation exists', () => {
    const error = new Error('bootstrap failed');
    const state = runtimeState('bootstrap-error', null, error);
    const result = projectHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel(state);

    expect(result.runtimeState).toBe(state);
    expect(result.runtimeState.lastError).toBe(error);
    expect(result.areaWeightProjection).toBeNull();
  });

  it('preserves a released semantic projection failure as exact Gate352 non-renderable evidence', () => {
    const presentationStateProjection: HomeDashboardLiveCryptoBubblePresentationStateProjectionResult = {
      ok: false,
      reason: 'neutral-threshold-invalid',
      metricObservation: {} as never,
    };
    const observation: HomeDashboardLiveCryptoBubblePresentationStateObservation = {
      metricObservation: presentationStateProjection.metricObservation,
      presentationStateProjection,
    };
    const state = runtimeState('running', observation);
    const result = projectHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel(state);

    expect(result.runtimeState).toBe(state);
    expect(result.areaWeightProjection).toEqual({
      ok: false,
      reason: 'presentation-state-projection-invalid',
      presentationStateProjection,
    });
  });
});
