import { describe, expect, it, vi } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import { createLiveMarketSummaryDeliveryState } from '../src/services/market-data/liveMarketSummaryDeliveryState';
import type {
  LiveMarketSummaryFact,
  MarketDataInstrument,
} from '../src/services/market-data/marketDataTypes';
import type { HomeDashboardLiveMarketSummaryFreshnessObservation } from '../src/application/dashboard/homeDashboardLiveMarketSummaryFreshnessObservationBridge';
import {
  createHomeDashboardLiveCryptoBubbleMetricObservationSink,
  type HomeDashboardLiveCryptoBubbleMetricObservation,
} from '../src/application/dashboard/homeDashboardLiveCryptoBubbleMetricObservationBridge';

const btc: MarketDataInstrument = { venue: 'binance-spot', symbol: 'BTCUSDT' };

function fact(): LiveMarketSummaryFact {
  return {
    instrument: btc,
    lastPrice: '110' as DecimalString,
    open24h: '100' as DecimalString,
    high24h: '111' as DecimalString,
    low24h: '99' as DecimalString,
    baseVolume24h: '50' as DecimalString,
    quoteVolume24h: '5000' as DecimalString,
    observedAt: '2026-09-10T00:00:00.000Z',
    sourceTimestamp: null,
  };
}

function successfulFreshnessObservation(): HomeDashboardLiveMarketSummaryFreshnessObservation {
  const marketFact = fact();
  return {
    acquisitionResult: {
      orchestrationResult: { ok: true, state: createLiveMarketSummaryDeliveryState() },
      scopedSnapshot: [{ instrument: btc, fact: marketFact }],
    },
    freshnessEvaluation: {
      ok: true,
      evaluationTimeMs: Date.parse('2026-09-10T00:00:10.000Z'),
      entries: [{ instrument: btc, fact: marketFact, ageMs: 10_000, freshness: 'fresh' }],
    },
  };
}

describe('Home Dashboard Live Crypto Bubble Metric Observation Bridge Foundation', () => {
  it('preserves the exact freshness observation and projects its exact freshness evaluation once', () => {
    const freshnessObservation = successfulFreshnessObservation();
    const observations: HomeDashboardLiveCryptoBubbleMetricObservation[] = [];
    const downstream = vi.fn((observation: HomeDashboardLiveCryptoBubbleMetricObservation) => {
      observations.push(observation);
    });
    const upstreamSink = createHomeDashboardLiveCryptoBubbleMetricObservationSink({
      onObservation: downstream,
    });

    upstreamSink.onObservation?.(freshnessObservation);

    expect(downstream).toHaveBeenCalledTimes(1);
    expect(observations).toHaveLength(1);
    expect(observations[0]?.freshnessObservation).toBe(freshnessObservation);
    expect(observations[0]?.bubbleMetricProjection).toEqual({
      ok: true,
      evaluationTimeMs: Date.parse('2026-09-10T00:00:10.000Z'),
      entries: [{
        instrument: btc,
        fact: freshnessObservation.freshnessEvaluation.ok
          ? freshnessObservation.freshnessEvaluation.entries[0]?.fact
          : null,
        ageMs: 10_000,
        freshness: 'fresh',
        quoteVolume24h: '5000',
        movementPercent24h: '10',
      }],
    });
  });

  it('keeps deterministic Bubble metric projection failure as observation data', () => {
    const freshnessObservation: HomeDashboardLiveMarketSummaryFreshnessObservation = {
      acquisitionResult: {
        orchestrationResult: { ok: true, state: createLiveMarketSummaryDeliveryState() },
        scopedSnapshot: [],
      },
      freshnessEvaluation: { ok: false, reason: 'evaluation-time-invalid' },
    };
    const observations: HomeDashboardLiveCryptoBubbleMetricObservation[] = [];
    const errors: unknown[] = [];
    const upstreamSink = createHomeDashboardLiveCryptoBubbleMetricObservationSink({
      onObservation: (observation) => observations.push(observation),
      onError: (error) => errors.push(error),
    });

    upstreamSink.onObservation?.(freshnessObservation);

    expect(errors).toEqual([]);
    expect(observations).toHaveLength(1);
    expect(observations[0]?.freshnessObservation).toBe(freshnessObservation);
    expect(observations[0]?.bubbleMetricProjection).toEqual({
      ok: false,
      reason: 'freshness-evaluation-invalid',
      freshnessReason: 'evaluation-time-invalid',
    });
  });

  it('forwards the upstream error channel unchanged', () => {
    const failure = new Error('lifecycle observer error');
    const errors: unknown[] = [];
    const onObservation = vi.fn();
    const upstreamSink = createHomeDashboardLiveCryptoBubbleMetricObservationSink({
      onObservation,
      onError: (error) => errors.push(error),
    });

    upstreamSink.onError?.(failure);

    expect(errors).toEqual([failure]);
    expect(onObservation).not.toHaveBeenCalled();
  });

  it('does not swallow downstream observation sink failures', () => {
    const freshnessObservation = successfulFreshnessObservation();
    const failure = new Error('downstream consumer failed');
    const upstreamSink = createHomeDashboardLiveCryptoBubbleMetricObservationSink({
      onObservation: () => { throw failure; },
    });

    expect(() => upstreamSink.onObservation?.(freshnessObservation)).toThrow(failure);
  });
});
