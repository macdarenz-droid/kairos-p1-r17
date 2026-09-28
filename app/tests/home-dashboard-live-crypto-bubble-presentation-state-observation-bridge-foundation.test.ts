import { describe, expect, it, vi } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import type { LiveMarketSummaryFact, MarketDataInstrument } from '../src/services/market-data/marketDataTypes';
import type { HomeDashboardLiveCryptoBubbleMetricObservation } from '../src/application/dashboard/homeDashboardLiveCryptoBubbleMetricObservationBridge';
import {
  createHomeDashboardLiveCryptoBubblePresentationStateObservationSink,
  type HomeDashboardLiveCryptoBubblePresentationStateObservation,
} from '../src/application/dashboard/homeDashboardLiveCryptoBubblePresentationStateObservationBridge';

const d = (value: string) => value as DecimalString;
const btc: MarketDataInstrument = { venue: 'binance-spot', symbol: 'BTCUSDT' };

function fact(): LiveMarketSummaryFact {
  return {
    instrument: btc,
    lastPrice: d('102'),
    open24h: d('100'),
    high24h: d('103'),
    low24h: d('99'),
    baseVolume24h: d('50'),
    quoteVolume24h: d('5000'),
    observedAt: '2026-09-10T00:00:00.000Z',
    sourceTimestamp: null,
  };
}

function successfulMetricObservation(): HomeDashboardLiveCryptoBubbleMetricObservation {
  const marketFact = fact();
  return {
    freshnessObservation: {
      acquisitionResult: { ok: true, scopedSnapshot: [] } as never,
      freshnessEvaluation: { ok: true, evaluationTimeMs: 1, entries: [] },
    },
    bubbleMetricProjection: {
      ok: true,
      evaluationTimeMs: 1,
      entries: [{
        instrument: btc,
        fact: marketFact,
        ageMs: 10_000,
        freshness: 'fresh',
        quoteVolume24h: d('5000'),
        movementPercent24h: d('0.2'),
      }],
    },
  };
}

describe('Home Dashboard Live Crypto Bubble presentation-state observation bridge foundation', () => {
  it('preserves the exact metric observation and applies the exact caller-owned presentation policy once', () => {
    const metricObservation = successfulMetricObservation();
    const observations: HomeDashboardLiveCryptoBubblePresentationStateObservation[] = [];
    const downstream = vi.fn((observation: HomeDashboardLiveCryptoBubblePresentationStateObservation) => {
      observations.push(observation);
    });
    const upstreamSink = createHomeDashboardLiveCryptoBubblePresentationStateObservationSink(
      { neutralMaxAbsoluteMovementPercent: d('0.25') },
      { onObservation: downstream },
    );

    upstreamSink.onObservation?.(metricObservation);

    expect(downstream).toHaveBeenCalledTimes(1);
    expect(observations).toHaveLength(1);
    expect(observations[0]?.metricObservation).toBe(metricObservation);
    expect(observations[0]?.presentationStateProjection.ok).toBe(true);
    if (observations[0]?.presentationStateProjection.ok) {
      expect(observations[0].presentationStateProjection.metricObservation).toBe(metricObservation);
      expect(observations[0].presentationStateProjection.entries[0]?.movementSemantic).toBe('neutral');
      expect(observations[0].presentationStateProjection.entries[0]?.freshnessState).toBe('fresh');
    }
  });

  it('keeps deterministic presentation-state projection failure as observation data rather than lifecycle error', () => {
    const metricObservation = successfulMetricObservation();
    const observations: HomeDashboardLiveCryptoBubblePresentationStateObservation[] = [];
    const errors: unknown[] = [];
    const upstreamSink = createHomeDashboardLiveCryptoBubblePresentationStateObservationSink(
      { neutralMaxAbsoluteMovementPercent: d('-0.1') },
      {
        onObservation: (observation) => observations.push(observation),
        onError: (error) => errors.push(error),
      },
    );

    upstreamSink.onObservation?.(metricObservation);

    expect(errors).toEqual([]);
    expect(observations).toHaveLength(1);
    expect(observations[0]?.metricObservation).toBe(metricObservation);
    expect(observations[0]?.presentationStateProjection).toEqual({
      ok: false,
      reason: 'neutral-threshold-invalid',
      metricObservation,
    });
  });

  it('forwards the upstream error channel unchanged', () => {
    const failure = new Error('upstream metric observation failed');
    const errors: unknown[] = [];
    const onObservation = vi.fn();
    const upstreamSink = createHomeDashboardLiveCryptoBubblePresentationStateObservationSink(
      { neutralMaxAbsoluteMovementPercent: d('0.25') },
      { onObservation, onError: (error) => errors.push(error) },
    );

    upstreamSink.onError?.(failure);

    expect(errors).toEqual([failure]);
    expect(onObservation).not.toHaveBeenCalled();
  });

  it('does not swallow downstream presentation-state observation sink failures', () => {
    const metricObservation = successfulMetricObservation();
    const failure = new Error('downstream presentation consumer failed');
    const upstreamSink = createHomeDashboardLiveCryptoBubblePresentationStateObservationSink(
      { neutralMaxAbsoluteMovementPercent: d('0.25') },
      { onObservation: () => { throw failure; } },
    );

    expect(() => upstreamSink.onObservation?.(metricObservation)).toThrow(failure);
  });
});
