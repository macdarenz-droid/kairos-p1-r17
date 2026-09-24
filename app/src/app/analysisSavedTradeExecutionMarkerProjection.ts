import type {
  AnalysisSavedTradeCandleWindowProjection,
  AnalysisSavedTradeCandleWindowUnavailableReason,
  AnalysisSavedTradeExecutionCandleReference,
  AnalysisSavedTradeExecutionCandlePlacement,
} from './analysisSavedTradeCandleWindowProjection';

export interface AnalysisSavedTradeExecutionMarker {
  readonly markerId: string;
  readonly role: 'entry' | 'exit';
  /** Series anchor only. The exact execution instant remains executedAt. */
  readonly candleAnchorTime: string;
  readonly candleCloseTime: string;
  readonly candleIndex: number;
  readonly executionId: string;
  readonly executedAt: string;
  readonly price: string;
  readonly quantity: string;
}

export interface AnalysisSavedTradeUnplacedExecution {
  readonly executionId: string;
  readonly role: 'entry' | 'exit';
  readonly executedAt: string;
  readonly price: string;
  readonly quantity: string;
  readonly reason: Extract<AnalysisSavedTradeExecutionCandlePlacement, { readonly kind: 'outside-window' }>['reason'];
}

export type AnalysisSavedTradeExecutionMarkerProjection =
  | {
      readonly kind: 'unavailable';
      readonly reason: AnalysisSavedTradeCandleWindowUnavailableReason;
    }
  | {
      readonly kind: 'markers-ready';
      readonly historyObservedAt: string;
      readonly historyInterval: string;
      readonly markers: readonly AnalysisSavedTradeExecutionMarker[];
      readonly unplacedExecutions: readonly AnalysisSavedTradeUnplacedExecution[];
    };

function exactFacts(execution: AnalysisSavedTradeExecutionCandleReference) {
  return {
    executionId: execution.executionId,
    role: execution.executionType,
    executedAt: execution.executedAt,
    price: execution.price,
    quantity: execution.quantity,
  } as const;
}

/**
 * Projects Gate439 placement evidence into provider-neutral execution-marker
 * facts. A placed marker is anchored at the authoritative candle open time so
 * a later renderer can address that exact series item, while executedAt and
 * every P14 execution fact remain unchanged. Unplaced executions stay explicit
 * and are never moved to the nearest candle.
 */
export function projectAnalysisSavedTradeExecutionMarkers(
  window: AnalysisSavedTradeCandleWindowProjection,
): AnalysisSavedTradeExecutionMarkerProjection {
  if (window.kind !== 'window-ready') {
    return Object.freeze({ kind: 'unavailable' as const, reason: window.reason });
  }

  const ids = new Set<string>();
  const markers: AnalysisSavedTradeExecutionMarker[] = [];
  const unplacedExecutions: AnalysisSavedTradeUnplacedExecution[] = [];

  for (const execution of window.executions) {
    if (ids.has(execution.executionId)) {
      throw new Error('analysis-saved-trade-execution-marker-id-duplicate');
    }
    ids.add(execution.executionId);

    if (execution.placement.kind === 'inside-candle') {
      markers.push(Object.freeze({
        markerId: `journal-execution:${execution.executionId}`,
        ...exactFacts(execution),
        candleAnchorTime: execution.placement.candleOpenTime,
        candleCloseTime: execution.placement.candleCloseTime,
        candleIndex: execution.placement.candleIndex,
      }));
    } else {
      unplacedExecutions.push(Object.freeze({
        ...exactFacts(execution),
        reason: execution.placement.reason,
      }));
    }
  }

  return Object.freeze({
    kind: 'markers-ready' as const,
    historyObservedAt: window.historyObservedAt,
    historyInterval: window.historyInterval,
    markers: Object.freeze(markers),
    unplacedExecutions: Object.freeze(unplacedExecutions),
  });
}
