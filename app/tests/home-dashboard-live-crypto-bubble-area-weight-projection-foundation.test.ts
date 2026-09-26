import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import type {
  HomeDashboardLiveCryptoBubblePresentationStateProjectionResult,
} from '../src/application/dashboard/homeDashboardLiveCryptoBubblePresentationStateProjection';
import { projectHomeDashboardLiveCryptoBubbleAreaWeights } from '../src/application/dashboard/homeDashboardLiveCryptoBubbleAreaWeightProjection';
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

function successProjection(volumes: readonly (DecimalString | null)[]): Extract<HomeDashboardLiveCryptoBubblePresentationStateProjectionResult, { ok: true }> {
  const entries = volumes.map((volume, index) => {
    const current = instrument(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'][index] ?? `T${index}USDT`);
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

describe('Home Dashboard Live Crypto Bubble area-weight projection foundation', () => {
  it('normalizes present 24h quote volume against the maximum while preserving exact entry order and semantic references', () => {
    const input = successProjection([d('1000'), d('500'), d('250'), null]);
    const result = projectHomeDashboardLiveCryptoBubbleAreaWeights(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.presentationStateProjection).toBe(input);
    expect(result.entries.map((entry) => entry.areaWeight)).toEqual([d('1'), d('0.5'), d('0.25'), null]);
    result.entries.forEach((entry, index) => expect(entry.presentationEntry).toBe(input.entries[index]));
  });

  it('does not sort or rerank when a later entry has the largest quote volume', () => {
    const input = successProjection([d('5'), d('20'), d('10')]);
    const result = projectHomeDashboardLiveCryptoBubbleAreaWeights(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((entry) => entry.presentationEntry.metricInput.instrument.symbol)).toEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
    expect(result.entries.map((entry) => entry.areaWeight)).toEqual([d('0.25'), d('1'), d('0.5')]);
  });

  it('keeps missing entries explicitly missing and does not invent a visible minimum area', () => {
    const input = successProjection([null, d('4'), null]);
    const result = projectHomeDashboardLiveCryptoBubbleAreaWeights(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((entry) => entry.areaWeight)).toEqual([null, d('1'), null]);
  });

  it('keeps all present zero-volume entries at exact zero instead of inventing a minimum radius', () => {
    const input = successProjection([d('0'), d('0'), null]);
    const result = projectHomeDashboardLiveCryptoBubbleAreaWeights(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((entry) => entry.areaWeight)).toEqual([d('0'), d('0'), null]);
  });

  it('preserves an upstream presentation-state failure exactly as non-renderable evidence', () => {
    const input: HomeDashboardLiveCryptoBubblePresentationStateProjectionResult = {
      ok: false,
      reason: 'neutral-threshold-invalid',
      metricObservation: {} as never,
    };
    expect(projectHomeDashboardLiveCryptoBubbleAreaWeights(input)).toEqual({
      ok: false,
      reason: 'presentation-state-projection-invalid',
      presentationStateProjection: input,
    });
  });

  it('fails closed when a released presentation entry is inconsistent instead of fabricating area truth', () => {
    const input = successProjection([d('10')]);
    const inconsistent = {
      ...input,
      entries: [{ ...input.entries[0], metricInput: { ...input.entries[0].metricInput, quoteVolume24h: null } }],
    } as Extract<HomeDashboardLiveCryptoBubblePresentationStateProjectionResult, { ok: true }>;

    expect(projectHomeDashboardLiveCryptoBubbleAreaWeights(inconsistent)).toEqual({
      ok: false,
      reason: 'area-weight-entry-inconsistent',
      presentationStateProjection: inconsistent,
      entryIndex: 0,
    });
  });
});
