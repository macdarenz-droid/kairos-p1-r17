import type {
  DecimalString,
  TradeExecutionRecord,
  TradePlanRecord,
  TradeRecord,
} from '../../domain/trades';

export interface TradeVisualizerPlannedLevels {
  readonly entry: DecimalString | null;
  readonly stop: DecimalString | null;
  readonly target: DecimalString | null;
}

export interface TradeVisualizerExecutedLevel {
  readonly executionId: TradeExecutionRecord['id'];
  readonly price: DecimalString;
  readonly quantity: DecimalString;
  readonly executedAt: string;
}

export type TradeVisualizerExecutedEntry = TradeVisualizerExecutedLevel;
export type TradeVisualizerExecutedExit = TradeVisualizerExecutedLevel;

export interface TradeVisualizerFactsProjection {
  readonly tradeId: TradeRecord['id'];
  readonly symbol: string;
  readonly side: TradeRecord['side'];
  readonly status: TradeRecord['status'];
  readonly planned: TradeVisualizerPlannedLevels;
  readonly executedEntries: readonly TradeVisualizerExecutedEntry[];
  readonly executedExits: readonly TradeVisualizerExecutedExit[];
}

/** The plan a trade's facts use: the one updated last; null when the trade has none. */
export function latestTradePlan(plans: readonly TradePlanRecord[]): TradePlanRecord | null {
  return plans.length === 0
    ? null
    : plans.reduce((latest, candidate) =>
        candidate.updatedAt > latest.updatedAt ? candidate : latest);
}

export function projectTradeVisualizerFacts(
  trade: TradeRecord,
  plans: readonly TradePlanRecord[],
  executions: readonly TradeExecutionRecord[],
): TradeVisualizerFactsProjection {
  const latestPlan = latestTradePlan(plans);

  const projectExecution = (execution: TradeExecutionRecord): TradeVisualizerExecutedLevel => Object.freeze({
    executionId: execution.id,
    price: execution.price,
    quantity: execution.quantity,
    executedAt: execution.executedAt,
  });

  const executedEntries = executions
    .filter((execution) => execution.type === 'entry')
    .map(projectExecution);

  const executedExits = executions
    .filter((execution) => execution.type === 'exit')
    .map(projectExecution);

  return Object.freeze({
    tradeId: trade.id,
    symbol: trade.symbol,
    side: trade.side,
    status: trade.status,
    planned: Object.freeze({
      entry: latestPlan?.plannedEntryPrice ?? null,
      stop: latestPlan?.plannedStopPrice ?? null,
      target: latestPlan?.plannedTargetPrice ?? null,
    }),
    executedEntries: Object.freeze(executedEntries),
    executedExits: Object.freeze(executedExits),
  });
}
