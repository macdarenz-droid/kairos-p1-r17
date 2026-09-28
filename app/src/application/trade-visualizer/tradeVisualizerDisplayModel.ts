import type { DecimalString } from '../../domain/trades';
import type { TradeVisualizerFactsProjection } from './tradeVisualizerFacts';

export type TradeVisualizerLevelKind =
  | 'planned-entry'
  | 'planned-stop'
  | 'planned-target'
  | 'executed-entry'
  | 'executed-exit';

export interface TradeVisualizerLevel {
  readonly kind: TradeVisualizerLevelKind;
  readonly label: string;
  readonly price: DecimalString;
  readonly quantity: DecimalString | null;
  readonly executedAt: string | null;
}

export interface TradeVisualizerDisplayModel {
  readonly symbol: string;
  readonly side: TradeVisualizerFactsProjection['side'];
  readonly status: TradeVisualizerFactsProjection['status'];
  readonly levels: readonly TradeVisualizerLevel[];
}

/**
 * P14.2 creates display semantics only.
 * It does not position/scale prices, draw candles, infer a current price,
 * generate a synthetic path, calculate P&L, or fetch market data.
 */
export function projectTradeVisualizerDisplayModel(
  facts: TradeVisualizerFactsProjection,
): TradeVisualizerDisplayModel {
  const levels: TradeVisualizerLevel[] = [];

  if (facts.planned.entry !== null) {
    levels.push(Object.freeze({
      kind: 'planned-entry',
      label: 'Planned entry',
      price: facts.planned.entry,
      quantity: null,
      executedAt: null,
    }));
  }
  if (facts.planned.stop !== null) {
    levels.push(Object.freeze({
      kind: 'planned-stop',
      label: 'Planned stop',
      price: facts.planned.stop,
      quantity: null,
      executedAt: null,
    }));
  }
  if (facts.planned.target !== null) {
    levels.push(Object.freeze({
      kind: 'planned-target',
      label: 'Planned target',
      price: facts.planned.target,
      quantity: null,
      executedAt: null,
    }));
  }

  facts.executedEntries.forEach((entry, index) => {
    levels.push(Object.freeze({
      kind: 'executed-entry',
      label: facts.executedEntries.length === 1 ? 'Actual entry' : `Actual entry ${index + 1}`,
      price: entry.price,
      quantity: entry.quantity,
      executedAt: entry.executedAt,
    }));
  });

  facts.executedExits.forEach((exit, index) => {
    levels.push(Object.freeze({
      kind: 'executed-exit',
      label: facts.executedExits.length === 1 ? 'Actual exit' : `Actual exit ${index + 1}`,
      price: exit.price,
      quantity: exit.quantity,
      executedAt: exit.executedAt,
    }));
  });

  return Object.freeze({
    symbol: facts.symbol,
    side: facts.side,
    status: facts.status,
    levels: Object.freeze(levels),
  });
}
