import type { ChartTimestamp } from '../features/chart';
import type { MarketCandleHistorySnapshot } from '../services/market-data/MarketCandleHistoryPort';
import type { MarketDataInstrument } from '../services/market-data/marketDataTypes';

export interface AnalysisSavedTradeRiskRewardSnapshotExtentScope {
  readonly instrument: MarketDataInstrument;
  readonly interval: string;
}

export type AnalysisSavedTradeRiskRewardSnapshotExtentUnavailableReason =
  | 'history-provenance-invalid'
  | 'history-scope-mismatch'
  | 'history-empty'
  | 'history-window-invalid';

export type AnalysisSavedTradeRiskRewardSnapshotExtentProjection =
  | {
      readonly kind: 'unavailable';
      readonly reason: AnalysisSavedTradeRiskRewardSnapshotExtentUnavailableReason;
    }
  | {
      readonly kind: 'extent-ready';
      readonly snapshot: MarketCandleHistorySnapshot;
      readonly extent: Readonly<{
        readonly start: ChartTimestamp;
        readonly end: ChartTimestamp;
      }>;
    };

function parseWindow(
  openTime: string,
  closeTime: string,
): Readonly<{ readonly openMs: number; readonly closeMs: number }> | null {
  const openMs = Date.parse(openTime);
  const closeMs = Date.parse(closeTime);
  if (!Number.isFinite(openMs) || !Number.isFinite(closeMs) || closeMs < openMs) return null;
  return { openMs, closeMs };
}

/**
 * Projects one exact caller-authoritative market-history page into the logical
 * time extent required by the released saved-trade Risk/Reward owner. Candle
 * bounds are validated but returned unchanged; no price, execution or missing
 * interval is inferred.
 */
export function projectAnalysisSavedTradeRiskRewardSnapshotExtent(
  snapshot: MarketCandleHistorySnapshot,
  scope: AnalysisSavedTradeRiskRewardSnapshotExtentScope,
): AnalysisSavedTradeRiskRewardSnapshotExtentProjection {
  const unavailable = (
    reason: AnalysisSavedTradeRiskRewardSnapshotExtentUnavailableReason,
  ): AnalysisSavedTradeRiskRewardSnapshotExtentProjection => Object.freeze({
    kind: 'unavailable' as const,
    reason,
  });

  if (snapshot.source !== 'market-reference' || snapshot.timeZone !== 'UTC') {
    return unavailable('history-provenance-invalid');
  }
  if (
    snapshot.request.instrument.venue !== scope.instrument.venue
    || snapshot.request.instrument.symbol !== scope.instrument.symbol
    || snapshot.request.interval !== scope.interval
  ) {
    return unavailable('history-scope-mismatch');
  }
  if (snapshot.candles.length === 0) return unavailable('history-empty');

  let previousCloseMs = -Infinity;
  for (const candle of snapshot.candles) {
    const window = parseWindow(candle.openTime, candle.closeTime);
    if (window === null || window.openMs <= previousCloseMs) {
      return unavailable('history-window-invalid');
    }
    previousCloseMs = window.closeMs;
  }

  const first = snapshot.candles[0];
  const last = snapshot.candles[snapshot.candles.length - 1];
  const extent = Object.freeze({ start: first.openTime, end: last.closeTime });
  return Object.freeze({
    kind: 'extent-ready' as const,
    snapshot,
    extent,
  });
}
