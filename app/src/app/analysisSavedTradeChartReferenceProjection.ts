import type { JournalHistoryEntry } from '../application/journal';
import {
  projectTradeVisualizerFacts,
  type TradeVisualizerFactsProjection,
} from '../application/trade-visualizer';
import type { MarketDataInstrument } from '../services/market-data/marketDataTypes';

export type AnalysisSavedTradeChartReferenceUnavailableReason =
  | 'market-type-mismatch'
  | 'symbol-mismatch'
  | 'price-currency-missing'
  | 'price-currency-mismatch';

export interface AnalysisSavedTradeChartReferenceScope {
  readonly instrument: MarketDataInstrument;
  /** Exact caller-authoritative quote asset from validated market metadata. */
  readonly quoteAsset: string;
}

interface AnalysisSavedTradeChartReferenceIdentity {
  readonly tradeId: JournalHistoryEntry['trade']['id'];
  readonly tradeSymbol: string;
  readonly chartInstrument: MarketDataInstrument;
  readonly chartQuoteAsset: string;
}

export type AnalysisSavedTradeChartReferenceProjection =
  | (AnalysisSavedTradeChartReferenceIdentity & {
      readonly kind: 'unavailable';
      readonly reason: AnalysisSavedTradeChartReferenceUnavailableReason;
    })
  | (AnalysisSavedTradeChartReferenceIdentity & {
      readonly kind: 'reference-ready';
      /** Trade records do not currently contain execution-venue evidence. */
      readonly executionVenue: null;
      /** Exact P14 facts; no price, time, quantity or level is recalculated. */
      readonly facts: TradeVisualizerFactsProjection;
    });

/**
 * Item-5 integration prerequisite between an exact saved trade and one
 * caller-selected market-reference chart. It fails closed unless the saved
 * market type, symbol and recorded price currency align with the chart scope.
 * A successful result still makes no execution-venue claim.
 */
export function projectAnalysisSavedTradeChartReference(
  entry: JournalHistoryEntry,
  scope: AnalysisSavedTradeChartReferenceScope,
): AnalysisSavedTradeChartReferenceProjection {
  const identity = {
    tradeId: entry.trade.id,
    tradeSymbol: entry.trade.symbol,
    chartInstrument: Object.freeze({ ...scope.instrument }),
    chartQuoteAsset: scope.quoteAsset,
  } as const;

  const unavailable = (
    reason: AnalysisSavedTradeChartReferenceUnavailableReason,
  ): AnalysisSavedTradeChartReferenceProjection => Object.freeze({
    ...identity,
    kind: 'unavailable' as const,
    reason,
  });

  if (entry.trade.marketType !== 'crypto') return unavailable('market-type-mismatch');
  if (entry.trade.symbol !== scope.instrument.symbol) return unavailable('symbol-mismatch');

  const priceCurrency = entry.trade.grossPnlCurrency;
  if (priceCurrency == null || priceCurrency === '') return unavailable('price-currency-missing');
  if (priceCurrency !== scope.quoteAsset) return unavailable('price-currency-mismatch');

  return Object.freeze({
    ...identity,
    kind: 'reference-ready' as const,
    executionVenue: null,
    facts: projectTradeVisualizerFacts(entry.trade, entry.plans, entry.executions),
  });
}
