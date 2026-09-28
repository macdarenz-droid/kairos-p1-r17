import type { JournalHistoryEntry } from '../journal/historyQuery';
import { projectTradeVisualizerDisplayModel, type TradeVisualizerDisplayModel } from './tradeVisualizerDisplayModel';
import { projectTradeVisualizerFacts } from './tradeVisualizerFacts';

/**
 * P14.3 wiring boundary.
 *
 * Journal History already owns hydration of trade/plans/executions. This
 * projection consumes that authoritative hydrated entry and delegates to the
 * P14 fact and display-semantic owners. It performs no database access,
 * calculation, price inference, or market-data work.
 */
export function projectJournalTradeVisualizer(
  entry: JournalHistoryEntry,
): TradeVisualizerDisplayModel {
  return projectTradeVisualizerDisplayModel(
    projectTradeVisualizerFacts(entry.trade, entry.plans, entry.executions),
  );
}
