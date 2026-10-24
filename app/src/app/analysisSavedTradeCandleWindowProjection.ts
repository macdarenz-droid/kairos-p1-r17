import type { TradeExecutionType } from '../domain/trades';
import type { MarketCandle, MarketCandleHistorySnapshot } from '../services/market-data/MarketCandleHistoryPort';
import type {
  AnalysisSavedTradeChartReferenceProjection,
  AnalysisSavedTradeChartReferenceUnavailableReason,
} from './analysisSavedTradeChartReferenceProjection';

export type AnalysisSavedTradeCandleWindowUnavailableReason =
  | 'reference-unavailable'
  | 'history-scope-mismatch'
  | 'history-empty'
  | 'history-window-invalid';

export type AnalysisSavedTradeExecutionCandlePlacement =
  | {
      readonly kind: 'inside-candle';
      readonly candleIndex: number;
      readonly candleOpenTime: string;
      readonly candleCloseTime: string;
    }
  | {
      readonly kind: 'outside-window';
      readonly reason: 'execution-time-invalid' | 'before-history' | 'after-history' | 'not-covered';
    };

export interface AnalysisSavedTradeExecutionCandleReference {
  readonly executionId: string;
  readonly executionType: TradeExecutionType;
  readonly price: string;
  readonly quantity: string;
  readonly executedAt: string;
  readonly placement: AnalysisSavedTradeExecutionCandlePlacement;
}

export type AnalysisSavedTradeCandleWindowProjection =
  | {
      readonly kind: 'unavailable';
      readonly reason: AnalysisSavedTradeCandleWindowUnavailableReason;
      readonly referenceReason: AnalysisSavedTradeChartReferenceUnavailableReason | null;
    }
  | {
      readonly kind: 'window-ready';
      readonly historyObservedAt: string;
      readonly historyInterval: string;
      readonly executions: readonly AnalysisSavedTradeExecutionCandleReference[];
    };

function parseWindow(candle: MarketCandle): { readonly openMs: number; readonly closeMs: number } | null {
  const openMs = Date.parse(candle.openTime);
  const closeMs = Date.parse(candle.closeTime);
  if (!Number.isFinite(openMs) || !Number.isFinite(closeMs) || closeMs < openMs) return null;
  return { openMs, closeMs };
}

/**
 * Places exact P14 journal executions inside one caller-authoritative history
 * page. A candle is only a time window: its OHLC never substitutes for the
 * recorded execution price, and an uncovered instant is never snapped to a
 * neighbouring candle.
 */
export function projectAnalysisSavedTradeCandleWindow(
  reference: AnalysisSavedTradeChartReferenceProjection,
  snapshot: MarketCandleHistorySnapshot,
): AnalysisSavedTradeCandleWindowProjection {
  if (reference.kind !== 'reference-ready') {
    return Object.freeze({
      kind: 'unavailable' as const,
      reason: 'reference-unavailable' as const,
      referenceReason: reference.reason,
    });
  }

  if (
    snapshot.request.instrument.venue !== reference.chartInstrument.venue
    || snapshot.request.instrument.symbol !== reference.chartInstrument.symbol
  ) {
    return Object.freeze({ kind: 'unavailable' as const, reason: 'history-scope-mismatch' as const, referenceReason: null });
  }
  if (snapshot.candles.length === 0) {
    return Object.freeze({ kind: 'unavailable' as const, reason: 'history-empty' as const, referenceReason: null });
  }

  const windows: { readonly openMs: number; readonly closeMs: number }[] = [];
  let previousCloseMs = -Infinity;
  for (const candle of snapshot.candles) {
    const window = parseWindow(candle);
    if (window === null || window.openMs <= previousCloseMs) {
      return Object.freeze({ kind: 'unavailable' as const, reason: 'history-window-invalid' as const, referenceReason: null });
    }
    windows.push(window);
    previousCloseMs = window.closeMs;
  }

  const firstOpenMs = windows[0].openMs;
  const lastCloseMs = windows[windows.length - 1].closeMs;
  const place = (
    executionType: TradeExecutionType,
    execution: typeof reference.facts.executedEntries[number],
  ): AnalysisSavedTradeExecutionCandleReference => {
    const executionMs = Date.parse(execution.executedAt);
    let placement: AnalysisSavedTradeExecutionCandlePlacement;
    if (!Number.isFinite(executionMs)) {
      placement = Object.freeze({ kind: 'outside-window' as const, reason: 'execution-time-invalid' as const });
    } else if (executionMs < firstOpenMs) {
      placement = Object.freeze({ kind: 'outside-window' as const, reason: 'before-history' as const });
    } else if (executionMs > lastCloseMs) {
      placement = Object.freeze({ kind: 'outside-window' as const, reason: 'after-history' as const });
    } else {
      const candleIndex = windows.findIndex((window) => executionMs >= window.openMs && executionMs <= window.closeMs);
      placement = candleIndex < 0
        ? Object.freeze({ kind: 'outside-window' as const, reason: 'not-covered' as const })
        : Object.freeze({
            kind: 'inside-candle' as const,
            candleIndex,
            candleOpenTime: snapshot.candles[candleIndex].openTime,
            candleCloseTime: snapshot.candles[candleIndex].closeTime,
          });
    }
    return Object.freeze({
      executionId: execution.executionId,
      executionType,
      price: execution.price,
      quantity: execution.quantity,
      executedAt: execution.executedAt,
      placement,
    });
  };

  return Object.freeze({
    kind: 'window-ready' as const,
    historyObservedAt: snapshot.observedAt,
    historyInterval: snapshot.request.interval,
    executions: Object.freeze([
      ...reference.facts.executedEntries.map((execution) => place('entry', execution)),
      ...reference.facts.executedExits.map((execution) => place('exit', execution)),
    ]),
  });
}
