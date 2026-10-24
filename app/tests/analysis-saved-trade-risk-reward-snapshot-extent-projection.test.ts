import { describe, expect, it } from 'vitest';
import { projectAnalysisSavedTradeRiskRewardSnapshotExtent } from '../src/app/analysisSavedTradeRiskRewardSnapshotExtentProjection';
import type { MarketCandleHistorySnapshot } from '../src/services/market-data/MarketCandleHistoryPort';

const instrument = Object.freeze({ venue: 'binance-spot', symbol: 'ETHUSDT' });
const scope = Object.freeze({ instrument, interval: '5m' });

function snapshot(overrides: Partial<MarketCandleHistorySnapshot> = {}): MarketCandleHistorySnapshot {
  return {
    source: 'market-reference',
    timeZone: 'UTC',
    observedAt: '2026-09-15T01:15:00.000Z',
    request: { instrument, interval: '5m', limit: 500 },
    candles: [
      { openTime: '2026-09-15T01:00:00.000Z', closeTime: '2026-09-15T01:04:59.999Z', open: '100', high: '102', low: '99', close: '101' },
      { openTime: '2026-09-15T01:10:00.000Z', closeTime: '2026-09-15T01:14:59.999Z', open: '101', high: '104', low: '100', close: '103' },
    ],
    ...overrides,
  } as MarketCandleHistorySnapshot;
}

describe('Analysis saved-trade Risk/Reward snapshot extent projection', () => {
  it('projects exact first-open and last-close bounds without normalizing a caller-authoritative page', () => {
    const history = snapshot();
    const result = projectAnalysisSavedTradeRiskRewardSnapshotExtent(history, scope);
    expect(result.kind).toBe('extent-ready');
    if (result.kind !== 'extent-ready') throw new Error('expected extent-ready');
    expect(result.snapshot).toBe(history);
    expect(result.extent).toEqual({
      start: '2026-09-15T01:00:00.000Z',
      end: '2026-09-15T01:14:59.999Z',
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.extent)).toBe(true);
  });

  it('permits explicit gaps while preserving the page bounds unchanged', () => {
    const result = projectAnalysisSavedTradeRiskRewardSnapshotExtent(snapshot(), scope);
    expect(result).toMatchObject({ kind: 'extent-ready' });
  });

  it.each([
    { instrument: { venue: 'other', symbol: 'ETHUSDT' }, interval: '5m' },
    { instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' }, interval: '5m' },
    { instrument, interval: '15m' },
  ])('fails closed for mismatched caller scope', (mismatchedScope) => {
    expect(projectAnalysisSavedTradeRiskRewardSnapshotExtent(snapshot(), mismatchedScope)).toEqual({
      kind: 'unavailable', reason: 'history-scope-mismatch',
    });
  });

  it('fails closed for non-authoritative provenance or an empty page', () => {
    expect(projectAnalysisSavedTradeRiskRewardSnapshotExtent(
      snapshot({ source: 'other' as never }), scope,
    )).toEqual({ kind: 'unavailable', reason: 'history-provenance-invalid' });
    expect(projectAnalysisSavedTradeRiskRewardSnapshotExtent(
      snapshot({ timeZone: 'local' as never }), scope,
    )).toEqual({ kind: 'unavailable', reason: 'history-provenance-invalid' });
    expect(projectAnalysisSavedTradeRiskRewardSnapshotExtent(
      snapshot({ candles: [] }), scope,
    )).toEqual({ kind: 'unavailable', reason: 'history-empty' });
  });

  it.each([
    [[{ openTime: 'invalid', closeTime: '2026-09-15T01:04:59.999Z' }]],
    [[{ openTime: '2026-09-15T01:05:00.000Z', closeTime: '2026-09-15T01:04:59.999Z' }]],
    [[
      { openTime: '2026-09-15T01:00:00.000Z', closeTime: '2026-09-15T01:04:59.999Z' },
      { openTime: '2026-09-15T01:04:59.999Z', closeTime: '2026-09-15T01:09:59.999Z' },
    ]],
  ])('rejects invalid, reversed, overlapping or unordered candle windows', (windows) => {
    const template = snapshot().candles[0];
    const candles = windows.map(window => ({ ...template, ...window }));
    expect(projectAnalysisSavedTradeRiskRewardSnapshotExtent(snapshot({ candles }), scope)).toEqual({
      kind: 'unavailable', reason: 'history-window-invalid',
    });
  });
});
