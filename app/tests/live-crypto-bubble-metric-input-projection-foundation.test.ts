import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import type { LiveMarketSummaryFreshnessEvaluationProjectionResult } from '../src/services/market-data/liveMarketSummaryFreshnessEvaluationProjection';
import { projectLiveCryptoBubbleMetricInputs } from '../src/services/market-data/liveCryptoBubbleMetricInputProjection';
import type { LiveMarketSummaryFact, MarketDataInstrument } from '../src/services/market-data/marketDataTypes';

type FreshnessSuccess = Extract<LiveMarketSummaryFreshnessEvaluationProjectionResult, { readonly ok: true }>;
const d = (value: string) => value as DecimalString;
const btc: MarketDataInstrument = { venue: 'binance-spot', symbol: 'BTCUSDT' };
const eth: MarketDataInstrument = { venue: 'binance-spot', symbol: 'ETHUSDT' };

function fact(overrides: Partial<LiveMarketSummaryFact> = {}): LiveMarketSummaryFact {
  return {
    instrument: btc,
    lastPrice: d('120'),
    open24h: d('100'),
    high24h: d('125'),
    low24h: d('90'),
    baseVolume24h: d('1000'),
    quoteVolume24h: d('123456.789'),
    observedAt: '2026-09-10T02:00:00.000Z',
    sourceTimestamp: null,
    ...overrides,
  };
}

describe('Live Crypto Bubble metric-input projection foundation', () => {
  it('preserves evaluated association and exposes exact quote-volume plus delegated 24h movement', () => {
    const marketFact = fact();
    const input: FreshnessSuccess = {
      ok: true,
      evaluationTimeMs: Date.parse('2026-09-10T02:00:10.000Z'),
      entries: [
        { instrument: btc, fact: marketFact, ageMs: 10000, freshness: 'fresh' },
      ],
    };

    const result = projectLiveCryptoBubbleMetricInputs(input);
    expect(result).toEqual({
      ok: true,
      evaluationTimeMs: input.evaluationTimeMs,
      entries: [
        {
          instrument: btc,
          fact: marketFact,
          ageMs: 10000,
          freshness: 'fresh',
          quoteVolume24h: d('123456.789'),
          movementPercent24h: d('20'),
        },
      ],
    });
    if (result.ok) {
      expect(result.entries[0].instrument).toBe(input.entries[0].instrument);
      expect(result.entries[0].fact).toBe(marketFact);
    }
  });

  it('preserves request/association order without introducing ranking truth', () => {
    const ethFact = fact({
      instrument: eth,
      lastPrice: d('90'),
      open24h: d('100'),
      quoteVolume24h: d('999999999'),
    });
    const btcFact = fact({ quoteVolume24h: d('1') });
    const input: FreshnessSuccess = {
      ok: true,
      evaluationTimeMs: Date.parse('2026-09-10T02:00:10.000Z'),
      entries: [
        { instrument: btc, fact: btcFact, ageMs: 10000, freshness: 'fresh' },
        { instrument: eth, fact: ethFact, ageMs: 60000, freshness: 'stale' },
      ],
    };

    const result = projectLiveCryptoBubbleMetricInputs(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((entry) => entry.instrument.symbol)).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(result.entries.map((entry) => entry.quoteVolume24h)).toEqual([d('1'), d('999999999')]);
    expect(result.entries.map((entry) => entry.movementPercent24h)).toEqual([d('20'), d('-10')]);
    expect(result.entries.map((entry) => entry.freshness)).toEqual(['fresh', 'stale']);
  });

  it('keeps a missing fact explicit with null metrics instead of inventing zero', () => {
    const input: FreshnessSuccess = {
      ok: true,
      evaluationTimeMs: 123,
      entries: [
        { instrument: btc, fact: null, ageMs: null, freshness: null },
      ],
    };

    expect(projectLiveCryptoBubbleMetricInputs(input)).toEqual({
      ok: true,
      evaluationTimeMs: 123,
      entries: [
        {
          instrument: btc,
          fact: null,
          ageMs: null,
          freshness: null,
          quoteVolume24h: null,
          movementPercent24h: null,
        },
      ],
    });
  });

  it('fails closed on upstream freshness-evaluation failure and preserves its deterministic reason', () => {
    expect(projectLiveCryptoBubbleMetricInputs({
      ok: false,
      reason: 'observation-after-evaluation',
    })).toEqual({
      ok: false,
      reason: 'freshness-evaluation-invalid',
      freshnessReason: 'observation-after-evaluation',
    });
  });

  it('fails closed with the exact entry index when delegated movement derivation fails', () => {
    const valid = fact();
    const invalid = fact({ instrument: eth, open24h: d('0') });
    const input: FreshnessSuccess = {
      ok: true,
      evaluationTimeMs: Date.parse('2026-09-10T02:00:10.000Z'),
      entries: [
        { instrument: btc, fact: valid, ageMs: 10000, freshness: 'fresh' },
        { instrument: eth, fact: invalid, ageMs: 10000, freshness: 'fresh' },
      ],
    };

    expect(projectLiveCryptoBubbleMetricInputs(input)).toEqual({
      ok: false,
      reason: 'movement-derivation-invalid',
      entryIndex: 1,
      movementReason: 'fact-invalid',
    });
  });

  it('preserves stale and expired classifications as data without applying visual policy', () => {
    const staleFact = fact();
    const expiredFact = fact({ instrument: eth, lastPrice: d('100'), open24h: d('100') });
    const input: FreshnessSuccess = {
      ok: true,
      evaluationTimeMs: Date.parse('2026-09-10T02:02:00.000Z'),
      entries: [
        { instrument: btc, fact: staleFact, ageMs: 60000, freshness: 'stale' },
        { instrument: eth, fact: expiredFact, ageMs: 120000, freshness: 'expired' },
      ],
    };

    const result = projectLiveCryptoBubbleMetricInputs(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0].freshness).toBe('stale');
    expect(result.entries[1].freshness).toBe('expired');
    expect(result.entries[1].movementPercent24h).toBe(d('0'));
  });
});
