import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import {
  evaluateLiveMarketSummaryScopedSnapshotFreshness,
  type LiveMarketSummaryFact,
  type LiveMarketSummaryScopedStateSnapshotEntry,
  type MarketDataInstrument,
} from '../src/services/market-data';

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

describe('Live Market Summary Freshness Evaluation Projection Foundation', () => {
  it('computes deterministic ages and delegates the released V1 freshness boundaries exactly', () => {
    const evaluationTimeMs = Date.parse('2026-09-09T00:01:00.001Z');
    const snapshot: readonly LiveMarketSummaryScopedStateSnapshotEntry[] = [
      { instrument: btc, fact: fact(btc, '2026-09-09T00:00:45.001Z') },
      { instrument: eth, fact: fact(eth, '2026-09-09T00:00:45.000Z') },
      { instrument: btc, fact: fact(btc, '2026-09-09T00:00:00.001Z') },
      { instrument: eth, fact: fact(eth, '2026-09-09T00:00:00.000Z') },
    ];

    const result = evaluateLiveMarketSummaryScopedSnapshotFreshness(snapshot, evaluationTimeMs);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((entry) => [entry.ageMs, entry.freshness])).toEqual([
      [15_000, 'fresh'],
      [15_001, 'stale'],
      [60_000, 'stale'],
      [60_001, 'expired'],
    ]);
  });

  it('preserves exact instrument/fact association and keeps missing facts explicitly unclassified', () => {
    const btcFact = fact(btc, '2026-09-09T00:00:00.000Z');
    const snapshot: readonly LiveMarketSummaryScopedStateSnapshotEntry[] = [
      { instrument: btc, fact: btcFact },
      { instrument: eth, fact: null },
    ];

    const result = evaluateLiveMarketSummaryScopedSnapshotFreshness(
      snapshot,
      Date.parse('2026-09-09T00:00:01.000Z'),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0]?.instrument).toBe(btc);
    expect(result.entries[0]?.fact).toBe(btcFact);
    expect(result.entries[1]).toEqual({ instrument: eth, fact: null, ageMs: null, freshness: null });
    expect(snapshot[0]?.fact).toBe(btcFact);
  });

  it('rejects invalid caller evaluation time rather than inventing a clock', () => {
    const snapshot = [{ instrument: btc, fact: fact(btc, '2026-09-09T00:00:00.000Z') }] as const;
    expect(evaluateLiveMarketSummaryScopedSnapshotFreshness(snapshot, Number.NaN)).toEqual({
      ok: false,
      reason: 'evaluation-time-invalid',
    });
    expect(evaluateLiveMarketSummaryScopedSnapshotFreshness(snapshot, -1)).toEqual({
      ok: false,
      reason: 'evaluation-time-invalid',
    });
  });

  it('rejects a future observation instead of silently converting negative age into current truth', () => {
    const snapshot = [{ instrument: btc, fact: fact(btc, '2026-09-09T00:00:01.001Z') }] as const;
    expect(evaluateLiveMarketSummaryScopedSnapshotFreshness(
      snapshot,
      Date.parse('2026-09-09T00:00:01.000Z'),
    )).toEqual({ ok: false, reason: 'observation-after-evaluation' });
  });

  it('delegates caller-supplied released policy configuration without hard-coding thresholds', () => {
    const snapshot = [{ instrument: btc, fact: fact(btc, '2026-09-09T00:00:00.000Z') }] as const;
    const result = evaluateLiveMarketSummaryScopedSnapshotFreshness(
      snapshot,
      Date.parse('2026-09-09T00:00:02.000Z'),
      { freshMaxAgeMs: 1_000, staleMaxAgeMs: 1_500 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0]?.freshness).toBe('expired');
  });

  it('rejects invalid fact input only through the released fact validator', () => {
    const invalid = { ...fact(btc, 'not-an-instant') };
    expect(evaluateLiveMarketSummaryScopedSnapshotFreshness(
      [{ instrument: btc, fact: invalid }],
      Date.parse('2026-09-09T00:00:02.000Z'),
    )).toEqual({ ok: false, reason: 'fact-invalid' });
  });
});
