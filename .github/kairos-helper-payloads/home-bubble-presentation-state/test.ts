import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import type { HomeDashboardLiveCryptoBubbleMetricObservation } from '../src/application/dashboard/homeDashboardLiveCryptoBubbleMetricObservationBridge';
import { projectHomeDashboardLiveCryptoBubblePresentationState } from '../src/application/dashboard/homeDashboardLiveCryptoBubblePresentationStateProjection';
import type { LiveMarketSummaryFact, MarketDataInstrument } from '../src/services/market-data/marketDataTypes';

const d = (value: string) => value as DecimalString;
const btc: MarketDataInstrument = { venue: 'binance-spot', symbol: 'BTCUSDT' };
const eth: MarketDataInstrument = { venue: 'binance-spot', symbol: 'ETHUSDT' };
const sol: MarketDataInstrument = { venue: 'binance-spot', symbol: 'SOLUSDT' };

function fact(instrument: MarketDataInstrument): LiveMarketSummaryFact {
  return {
    instrument,
    lastPrice: d('100'),
    open24h: d('100'),
    high24h: d('110'),
    low24h: d('90'),
    baseVolume24h: d('1000'),
    quoteVolume24h: d('500000'),
    observedAt: '2026-09-10T05:00:00.000Z',
    sourceTimestamp: null,
  };
}

function observation(): HomeDashboardLiveCryptoBubbleMetricObservation {
  const btcFact = fact(btc);
  const ethFact = fact(eth);
  const solFact = fact(sol);
  return {
    freshnessObservation: {
      acquisitionResult: { ok: true, scopedSnapshot: [] } as never,
      freshnessEvaluation: { ok: true, evaluationTimeMs: 1, entries: [] },
    },
    bubbleMetricProjection: {
      ok: true,
      evaluationTimeMs: 1,
      entries: [
        { instrument: btc, fact: btcFact, ageMs: 1000, freshness: 'fresh', quoteVolume24h: d('500000'), movementPercent24h: d('2.5') },
        { instrument: eth, fact: ethFact, ageMs: 30000, freshness: 'stale', quoteVolume24h: d('400000'), movementPercent24h: d('-1.2') },
        { instrument: sol, fact: solFact, ageMs: 70000, freshness: 'expired', quoteVolume24h: d('300000'), movementPercent24h: d('0.15') },
        { instrument: { venue: 'binance-spot', symbol: 'XRPUSDT' }, fact: null, ageMs: null, freshness: null, quoteVolume24h: null, movementPercent24h: null },
      ],
    },
  };
}

describe('Home Dashboard Live Crypto Bubble presentation-state projection foundation', () => {
  it('preserves exact metric inputs and classifies positive, negative, near-zero, freshness, and missing semantics without styling', () => {
    const input = observation();
    const result = projectHomeDashboardLiveCryptoBubblePresentationState(input, {
      neutralMaxAbsoluteMovementPercent: d('0.25'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metricObservation).toBe(input);
    expect(result.entries.map((entry) => ({
      availability: entry.availability,
      movementSemantic: entry.movementSemantic,
      freshnessState: entry.freshnessState,
    }))).toEqual([
      { availability: 'present', movementSemantic: 'positive', freshnessState: 'fresh' },
      { availability: 'present', movementSemantic: 'negative', freshnessState: 'stale' },
      { availability: 'present', movementSemantic: 'neutral', freshnessState: 'expired' },
      { availability: 'missing', movementSemantic: null, freshnessState: 'missing' },
    ]);
    result.entries.forEach((entry, index) => {
      expect(entry.metricInput).toBe(input.bubbleMetricProjection.ok ? input.bubbleMetricProjection.entries[index] : null);
    });
  });

  it('treats both signs at the exact caller-owned neutral boundary as neutral and does not invent a default threshold', () => {
    const input = observation();
    if (!input.bubbleMetricProjection.ok) throw new Error('fixture');
    const adjusted: HomeDashboardLiveCryptoBubbleMetricObservation = {
      ...input,
      bubbleMetricProjection: {
        ...input.bubbleMetricProjection,
        entries: [
          { ...input.bubbleMetricProjection.entries[0], movementPercent24h: d('0.25') },
          { ...input.bubbleMetricProjection.entries[1], movementPercent24h: d('-0.25') },
          { ...input.bubbleMetricProjection.entries[2], movementPercent24h: d('0') },
        ],
      },
    };

    const result = projectHomeDashboardLiveCryptoBubblePresentationState(adjusted, {
      neutralMaxAbsoluteMovementPercent: d('0.25'),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.entries.map((entry) => entry.movementSemantic)).toEqual(['neutral', 'neutral', 'neutral']);
  });

  it('fails closed on a negative or malformed caller-owned neutral threshold', () => {
    const input = observation();
    expect(projectHomeDashboardLiveCryptoBubblePresentationState(input, {
      neutralMaxAbsoluteMovementPercent: d('-0.1'),
    })).toEqual({ ok: false, reason: 'neutral-threshold-invalid', metricObservation: input });
    expect(projectHomeDashboardLiveCryptoBubblePresentationState(input, {
      neutralMaxAbsoluteMovementPercent: 'not-a-decimal' as DecimalString,
    })).toEqual({ ok: false, reason: 'neutral-threshold-invalid', metricObservation: input });
  });

  it('preserves an upstream Bubble metric projection failure as explicit non-presentation failure data', () => {
    const input: HomeDashboardLiveCryptoBubbleMetricObservation = {
      freshnessObservation: {
        acquisitionResult: { ok: false, reason: 'acquisition-failed' } as never,
        freshnessEvaluation: { ok: false, reason: 'evaluation-time-invalid' },
      },
      bubbleMetricProjection: {
        ok: false,
        reason: 'freshness-evaluation-invalid',
        freshnessReason: 'evaluation-time-invalid',
      },
    };
    expect(projectHomeDashboardLiveCryptoBubblePresentationState(input, {
      neutralMaxAbsoluteMovementPercent: d('0.25'),
    })).toEqual({
      ok: false,
      reason: 'bubble-metric-projection-invalid',
      metricObservation: input,
      bubbleMetricProjection: input.bubbleMetricProjection,
    });
  });

  it('keeps expired explicitly non-current and fails closed on inconsistent released metric-entry shape', () => {
    const input = observation();
    const result = projectHomeDashboardLiveCryptoBubblePresentationState(input, {
      neutralMaxAbsoluteMovementPercent: d('0.25'),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.entries[2].freshnessState).toBe('expired');

    if (!input.bubbleMetricProjection.ok) throw new Error('fixture');
    const inconsistent: HomeDashboardLiveCryptoBubbleMetricObservation = {
      ...input,
      bubbleMetricProjection: {
        ...input.bubbleMetricProjection,
        entries: [
          { ...input.bubbleMetricProjection.entries[0], freshness: null },
        ],
      },
    };
    expect(projectHomeDashboardLiveCryptoBubblePresentationState(inconsistent, {
      neutralMaxAbsoluteMovementPercent: d('0.25'),
    })).toEqual({ ok: false, reason: 'metric-entry-inconsistent', metricObservation: inconsistent, entryIndex: 0 });
  });
});
