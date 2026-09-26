import { describe, expect, it, vi } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import { createLiveMarketSummaryDeliveryState } from '../src/services/market-data/liveMarketSummaryDeliveryState';
import type {
  LiveMarketSummaryFact,
  MarketDataInstrument,
} from '../src/services/market-data/marketDataTypes';
import type { HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionResult } from '../src/application/dashboard/homeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort';
import {
  createHomeDashboardLiveMarketSummaryFreshnessObservationObserver,
  type HomeDashboardLiveMarketSummaryFreshnessObservation,
} from '../src/application/dashboard/homeDashboardLiveMarketSummaryFreshnessObservationBridge';

const btc: MarketDataInstrument = { venue: 'binance-spot', symbol: 'BTCUSDT' };
const eth: MarketDataInstrument = { venue: 'binance-spot', symbol: 'ETHUSDT' };

function fact(instrument: MarketDataInstrument, observedAt: string): LiveMarketSummaryFact {
  return {
    instrument,
    lastPrice: '100' as DecimalString,
    open24h: '99' as DecimalString,
    high24h: '101' as DecimalString,
    low24h: '98' as DecimalString,
    baseVolume24h: '10' as DecimalString,
    quoteVolume24h: '1000' as DecimalString,
    observedAt,
    sourceTimestamp: null,
  };
}

describe('Home Dashboard Live Market Summary Freshness Observation Bridge Foundation', () => {
  it('reads caller evaluation time once, evaluates the exact scoped snapshot, and preserves the acquisition result unchanged', () => {
    const result: HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionResult = {
      orchestrationResult: { ok: true, state: createLiveMarketSummaryDeliveryState() },
      scopedSnapshot: [
        { instrument: btc, fact: fact(btc, '2026-09-09T00:00:40.000Z') },
        { instrument: eth, fact: null },
      ],
    };
    const readEvaluationTimeMs = vi.fn(() => Date.parse('2026-09-09T00:01:00.000Z'));
    const observations: HomeDashboardLiveMarketSummaryFreshnessObservation[] = [];
    const observer = createHomeDashboardLiveMarketSummaryFreshnessObservationObserver(
      readEvaluationTimeMs,
      { onObservation: (observation) => observations.push(observation) },
    );

    observer.onResult?.(result);

    expect(readEvaluationTimeMs).toHaveBeenCalledTimes(1);
    expect(observations).toHaveLength(1);
    expect(observations[0]?.acquisitionResult).toBe(result);
    expect(observations[0]?.freshnessEvaluation).toEqual({
      ok: true,
      evaluationTimeMs: Date.parse('2026-09-09T00:01:00.000Z'),
      entries: [
        { instrument: btc, fact: result.scopedSnapshot[0]?.fact, ageMs: 20_000, freshness: 'stale' },
        { instrument: eth, fact: null, ageMs: null, freshness: null },
      ],
    });
  });

  it('keeps acquisition failure separate while still evaluating retained authoritative facts', () => {
    const retained = fact(btc, '2026-09-09T00:00:00.000Z');
    const result: HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionResult = {
      orchestrationResult: {
        ok: false,
        reason: 'acquisition-failed',
        state: createLiveMarketSummaryDeliveryState(),
      },
      scopedSnapshot: [{ instrument: btc, fact: retained }],
    };
    const observations: HomeDashboardLiveMarketSummaryFreshnessObservation[] = [];
    const observer = createHomeDashboardLiveMarketSummaryFreshnessObservationObserver(
      () => Date.parse('2026-09-09T00:01:01.000Z'),
      { onObservation: (observation) => observations.push(observation) },
    );

    observer.onResult?.(result);

    expect(observations[0]?.acquisitionResult).toBe(result);
    expect(observations[0]?.acquisitionResult.orchestrationResult).toBe(result.orchestrationResult);
    expect(observations[0]?.freshnessEvaluation).toEqual({
      ok: true,
      evaluationTimeMs: Date.parse('2026-09-09T00:01:01.000Z'),
      entries: [{ instrument: btc, fact: retained, ageMs: 61_000, freshness: 'expired' }],
    });
  });

  it('preserves deterministic evaluation failures as observation data rather than turning them into lifecycle errors', () => {
    const result: HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionResult = {
      orchestrationResult: { ok: true, state: createLiveMarketSummaryDeliveryState() },
      scopedSnapshot: [{ instrument: btc, fact: fact(btc, '2026-09-09T00:00:00.000Z') }],
    };
    const observations: HomeDashboardLiveMarketSummaryFreshnessObservation[] = [];
    const errors: unknown[] = [];
    const observer = createHomeDashboardLiveMarketSummaryFreshnessObservationObserver(
      () => Number.NaN,
      {
        onObservation: (observation) => observations.push(observation),
        onError: (error) => errors.push(error),
      },
    );

    observer.onResult?.(result);

    expect(errors).toEqual([]);
    expect(observations[0]?.freshnessEvaluation).toEqual({
      ok: false,
      reason: 'evaluation-time-invalid',
    });
  });

  it('forwards a thrown caller evaluation-time source error without fabricating an observation', () => {
    const failure = new Error('clock source failed');
    const observations: HomeDashboardLiveMarketSummaryFreshnessObservation[] = [];
    const errors: unknown[] = [];
    const observer = createHomeDashboardLiveMarketSummaryFreshnessObservationObserver(
      () => { throw failure; },
      {
        onObservation: (observation) => observations.push(observation),
        onError: (error) => errors.push(error),
      },
    );
    const result: HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionResult = {
      orchestrationResult: { ok: true, state: createLiveMarketSummaryDeliveryState() },
      scopedSnapshot: [],
    };

    observer.onResult?.(result);

    expect(observations).toEqual([]);
    expect(errors).toEqual([failure]);
  });

  it('forwards the existing lifecycle error channel unchanged', () => {
    const failure = new Error('acquisition rejected');
    const errors: unknown[] = [];
    const readEvaluationTimeMs = vi.fn(() => 0);
    const observer = createHomeDashboardLiveMarketSummaryFreshnessObservationObserver(
      readEvaluationTimeMs,
      { onError: (error) => errors.push(error) },
    );

    observer.onError?.(failure);

    expect(errors).toEqual([failure]);
    expect(readEvaluationTimeMs).not.toHaveBeenCalled();
  });
});
