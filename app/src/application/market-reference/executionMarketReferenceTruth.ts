import type { TradeExecutionRecord } from '../../domain/trades';
import type { MarketPriceObservation } from '../../services/market-data';

/**
 * P16.10 truth boundary: journal execution truth and external market-reference
 * truth are separate facts. Market data may contextualize an execution but
 * must never replace or mutate the journal execution.
 */
export interface JournalExecutionTruth {
  readonly executionId: TradeExecutionRecord['id'];
  readonly tradeId: TradeExecutionRecord['tradeId'];
  readonly executionType: TradeExecutionRecord['type'];
  readonly price: TradeExecutionRecord['price'];
  readonly executedAt: TradeExecutionRecord['executedAt'];
}

export interface ExternalMarketReferenceTruth {
  readonly referenceKind: 'trade-observation';
  readonly venue: MarketPriceObservation['instrument']['venue'];
  readonly symbol: MarketPriceObservation['instrument']['symbol'];
  readonly price: MarketPriceObservation['price'];
  readonly observedAt: MarketPriceObservation['observedAt'];
  readonly sourceTimestamp: MarketPriceObservation['sourceTimestamp'];
}

export interface ExecutionMarketReferenceTruth {
  readonly execution: JournalExecutionTruth;
  readonly marketReference: ExternalMarketReferenceTruth;
  readonly reconciliation: 'none';
  readonly mayOverwriteExecution: false;
}

export function projectExecutionMarketReferenceTruth(
  execution: TradeExecutionRecord,
  marketObservation: MarketPriceObservation,
): ExecutionMarketReferenceTruth {
  return Object.freeze({
    execution: Object.freeze({
      executionId: execution.id,
      tradeId: execution.tradeId,
      executionType: execution.type,
      price: execution.price,
      executedAt: execution.executedAt,
    }),
    marketReference: Object.freeze({
      referenceKind: 'trade-observation' as const,
      venue: marketObservation.instrument.venue,
      symbol: marketObservation.instrument.symbol,
      price: marketObservation.price,
      observedAt: marketObservation.observedAt,
      sourceTimestamp: marketObservation.sourceTimestamp,
    }),
    reconciliation: 'none' as const,
    mayOverwriteExecution: false as const,
  });
}
