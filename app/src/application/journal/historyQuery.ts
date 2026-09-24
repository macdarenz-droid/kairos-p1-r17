import type { KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import { calculateTradeMetrics, type TradeMetricsResult } from '../../domain/calculations';
import { projectVisualPnlOutcome, type VisualPnlOutcomeProjection } from '../visual-pnl';
import type { TradeExecutionRecord, TradeFeeRecord, TradePlanRecord, TradeRecord, TradeSource, TradeStatus, TradeId } from '../../domain/trades';

export interface JournalHistoryEntry {
  readonly trade: TradeRecord;
  readonly plans: readonly TradePlanRecord[];
  readonly executions: readonly TradeExecutionRecord[];
  readonly fees: readonly TradeFeeRecord[];
  readonly metrics: Extract<TradeMetricsResult, { readonly ok: true }>['value'] | null;
  readonly metricsError: Extract<TradeMetricsResult, { readonly ok: false }>['reason'] | null;
  readonly visualPnl: VisualPnlOutcomeProjection;
}

export const DEFAULT_JOURNAL_HISTORY_LIMIT = 100 as const;
export const MAX_JOURNAL_HISTORY_LIMIT = 500 as const;

/** P29.2: which trade sources a history read covers. Real results never include practice trades; the Practice page reads only them. */
export type JournalHistoryScope = 'real' | 'practice';
export const JOURNAL_HISTORY_SOURCES: Readonly<Record<JournalHistoryScope, readonly TradeSource[]>> = Object.freeze({
  real: Object.freeze(['manual', 'import', 'broker-import'] as const),
  practice: Object.freeze(['paper', 'replay'] as const),
});
export const DEFAULT_JOURNAL_HISTORY_SCOPE: JournalHistoryScope = 'real';

export interface JournalHistoryQueryOptions { readonly limit?: number; readonly status?: TradeStatus; readonly scope?: JournalHistoryScope; }

function normalizeHistoryLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_JOURNAL_HISTORY_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_JOURNAL_HISTORY_LIMIT) {
    throw new RangeError(`Journal history limit must be an integer from 1 to ${MAX_JOURNAL_HISTORY_LIMIT}.`);
  }
  return limit;
}

export async function listJournalHistory(
  db: KairosDatabase,
  options: JournalHistoryQueryOptions = {},
): Promise<readonly JournalHistoryEntry[]> {
  const repositories = createKairosRepositories(db);
  const scoped = repositories.trades.scopedBySource(JOURNAL_HISTORY_SOURCES[options.scope ?? DEFAULT_JOURNAL_HISTORY_SCOPE]);
  const trades = options.status === undefined
    ? await scoped.listRecentByUpdatedAt(normalizeHistoryLimit(options.limit))
    : await scoped.listRecentByStatusAndUpdatedAt(options.status, normalizeHistoryLimit(options.limit));

  const entries = await Promise.all(trades.map(trade => hydrateJournalHistoryEntry(repositories, trade)));

  return Object.freeze(entries);
}


/** Shared P12 hydration and calculation owner for bounded history and exact-id review. */
async function hydrateJournalHistoryEntry(
  repositories: ReturnType<typeof createKairosRepositories>,
  trade: TradeRecord,
): Promise<JournalHistoryEntry> {
  const [plans, executions, fees] = await Promise.all([
    repositories.tradePlans.listByTradeId(trade.id),
    repositories.tradeExecutions.listByTradeId(trade.id),
    repositories.tradeFees.listByTradeId(trade.id),
  ]);
  const metricsResult = trade.grossPnlCurrency
    ? calculateTradeMetrics(trade.side, executions, undefined, fees, { grossPnlCurrency: trade.grossPnlCurrency })
    : calculateTradeMetrics(trade.side, executions, undefined, fees);
  return Object.freeze({
    trade,
    plans: Object.freeze(plans),
    executions: Object.freeze(executions),
    fees: Object.freeze(fees),
    metrics: metricsResult.ok ? metricsResult.value : null,
    metricsError: metricsResult.ok ? null : metricsResult.reason,
    visualPnl: projectVisualPnlOutcome(metricsResult.ok ? metricsResult.value : null),
  });
}

/** A consistent read of one saved identity; never scan or fall back to a recent trade. */
export async function getJournalHistoryEntry(
  db: KairosDatabase, id: string,
): Promise<JournalHistoryEntry | null> {
  if (!id) return null;
  const repositories = createKairosRepositories(db);
  return db.transaction(
    'r', ['trades', 'tradePlans', 'tradeExecutions', 'tradeFees'],
    async () => {
      const trade = await repositories.trades.get(id as TradeId);
      return trade ? hydrateJournalHistoryEntry(repositories, trade) : null;
    },
  );
}
