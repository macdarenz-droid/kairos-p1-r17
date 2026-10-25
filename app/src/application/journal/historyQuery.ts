import type { KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import { calculateSavedTradeMetrics, type TradeMetricsResult } from '../../domain/calculations';
import { projectVisualPnlOutcome, type VisualPnlOutcomeProjection } from '../visual-pnl';
import { tradeJournalAt, type TradeExecutionRecord, type TradeFeeRecord, type TradePlanRecord, type TradeRecord, type TradeSource, type TradeStatus, type TradeId } from '../../domain/trades';
import { journalDateBounds, matchesJournalDetails, matchesJournalTradeFields, needsJournalDetails, NO_JOURNAL_FILTERS, type JournalFilters } from './journalFilters';

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
  // The Journal's order (D259): when each trade happened, latest first.
  const trades = await scoped.listPageByJournalAt(options.status ?? null, null, normalizeHistoryLimit(options.limit));

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
  return composeJournalHistoryEntry(trade, plans, executions, fees);
}

/** Calculation and freezing for one trade's saved rows; the one place a history entry is built. */
function composeJournalHistoryEntry(
  trade: TradeRecord,
  plans: readonly TradePlanRecord[],
  executions: readonly TradeExecutionRecord[],
  fees: readonly TradeFeeRecord[],
): JournalHistoryEntry {
  // D237: the same call as the picture's, so the Journal and the picture never disagree.
  const metricsResult = calculateSavedTradeMetrics(trade, executions, fees);
  return Object.freeze({
    trade,
    plans: Object.freeze([...plans]),
    executions: Object.freeze([...executions]),
    fees: Object.freeze([...fees]),
    metrics: metricsResult.ok ? metricsResult.value : null,
    metricsError: metricsResult.ok ? null : metricsResult.reason,
    visualPnl: projectVisualPnlOutcome(metricsResult.ok ? metricsResult.value : null),
  });
}

function groupByTradeId<T extends { readonly tradeId: TradeId }>(rows: readonly T[]): Map<TradeId, T[]> {
  const groups = new Map<TradeId, T[]>();
  for (const row of rows) {
    const group = groups.get(row.tradeId);
    if (group) group.push(row);
    else groups.set(row.tradeId, [row]);
  }
  return groups;
}

/**
 * Batch hydration: three reads for all trades, grouped by trade in the order
 * they came back, so each trade gets the same rows in the same order as
 * `listByTradeId` gives it. Entries come back in input order.
 */
export async function hydrateJournalHistoryEntries(
  repositories: ReturnType<typeof createKairosRepositories>,
  trades: readonly TradeRecord[],
): Promise<readonly JournalHistoryEntry[]> {
  if (trades.length === 0) return Object.freeze([]);
  const ids = trades.map(trade => trade.id);
  const [plans, executions, fees] = await Promise.all([
    repositories.tradePlans.listByTradeIds(ids),
    repositories.tradeExecutions.listByTradeIds(ids),
    repositories.tradeFees.listByTradeIds(ids),
  ]);
  const plansByTrade = groupByTradeId(plans), executionsByTrade = groupByTradeId(executions), feesByTrade = groupByTradeId(fees);
  return Object.freeze(trades.map(trade => composeJournalHistoryEntry(
    trade, plansByTrade.get(trade.id) ?? [], executionsByTrade.get(trade.id) ?? [], feesByTrade.get(trade.id) ?? [],
  )));
}

/** Every open trade in scope, newest edit first, with no limit (goals count trades opened today). */
export async function listJournalOpenTrades(
  db: KairosDatabase,
  options: { readonly scope?: JournalHistoryScope } = {},
): Promise<readonly JournalHistoryEntry[]> {
  const repositories = createKairosRepositories(db);
  return db.transaction('r', ['trades', 'tradePlans', 'tradeExecutions', 'tradeFees'], async () => {
    const trades = await repositories.trades.scopedBySource(JOURNAL_HISTORY_SOURCES[options.scope ?? DEFAULT_JOURNAL_HISTORY_SCOPE]).listAllByStatus('open');
    return hydrateJournalHistoryEntries(repositories, trades);
  });
}

export const JOURNAL_HISTORY_PAGE_SIZE = DEFAULT_JOURNAL_HISTORY_LIMIT;
export interface JournalHistoryCursor { readonly journalAt: string; readonly id: TradeId; }
export interface JournalHistoryPage { readonly entries: readonly JournalHistoryEntry[]; readonly nextCursor: JournalHistoryCursor | null; }

/** Where the next page starts: just after this trade in the Journal's order (the stored index key, which a read trade carries). */
const cursorOf = (trade: TradeRecord & { readonly journalAt?: string }): JournalHistoryCursor => Object.freeze({ journalAt: trade.journalAt ?? tradeJournalAt(trade), id: trade.id });

/** Trades read and checked at a time when filters need each trade's result, checklist or review (D262). */
export const JOURNAL_FILTER_BATCH = 200;

export interface JournalMatchOptions {
  readonly scope?: JournalHistoryScope;
  readonly filters?: JournalFilters;
  /** The trader's time zone, for the From and To days. */
  readonly timeZone?: string;
  readonly before?: JournalHistoryCursor | null;
}

/**
 * U15 (D262): the trades matching the filters in the Journal's order, strictly before `before`: at most `wanted`
 * (null: all), with whether more are left. The trade's own fields (scope, status, market, side, the symbol search,
 * the dates) are tested while the cursor walks; its result, strategy and mistakes are read and tested a batch at a time.
 * Call inside a read transaction over the trades, their plans, entries and exits, fees and checklist records.
 */
async function collectJournalMatches(
  repositories: ReturnType<typeof createKairosRepositories>, options: JournalMatchOptions, wanted: number | null,
): Promise<Readonly<{ entries: readonly JournalHistoryEntry[]; more: boolean }>> {
  const filters = options.filters ?? NO_JOURNAL_FILTERS;
  const timeZone = options.timeZone ?? 'UTC';
  // Only a closed trade has a result after fees.
  if (filters.result !== null && filters.status !== null && filters.status !== 'closed') return { entries: [], more: false };
  const status = filters.result !== null ? 'closed' : filters.status;
  const scoped = repositories.trades.scopedBySource(JOURNAL_HISTORY_SOURCES[options.scope ?? DEFAULT_JOURNAL_HISTORY_SCOPE]);
  const dates = journalDateBounds(filters);
  const keep = (trade: TradeRecord) => matchesJournalTradeFields(trade, filters, timeZone);
  if (!needsJournalDetails(filters)) {
    const rows = await scoped.listPageByJournalAtWhere(status, options.before ?? null, dates, keep, wanted === null ? Infinity : wanted + 1);
    const kept = wanted === null ? rows : rows.slice(0, wanted);
    return { entries: await hydrateJournalHistoryEntries(repositories, kept), more: wanted !== null && rows.length > wanted };
  }
  const matches: JournalHistoryEntry[] = [];
  let cursor = options.before ?? null;
  for (;;) {
    const rows = await scoped.listPageByJournalAtWhere(status, cursor, dates, keep, JOURNAL_FILTER_BATCH);
    const [entries, records] = await Promise.all([
      hydrateJournalHistoryEntries(repositories, rows),
      filters.strategy !== null || filters.mistake !== null ? repositories.tradeDiscipline.listByTradeIds(rows.map(trade => trade.id)) : [],
    ]);
    const recordOf = new Map(records.map(record => [record.tradeId, record]));
    for (const entry of entries) {
      if (!matchesJournalDetails(entry.visualPnl.outcome, recordOf.get(entry.trade.id) ?? null, filters)) continue;
      if (wanted !== null && matches.length === wanted) return { entries: matches, more: true };
      matches.push(entry);
    }
    const last = rows[rows.length - 1];
    if (rows.length < JOURNAL_FILTER_BATCH || last === undefined) return { entries: matches, more: false };
    cursor = cursorOf(last);
  }
}

const MATCH_STORES = ['trades', 'tradePlans', 'tradeExecutions', 'tradeFees', 'tradeDiscipline'] as const;

/**
 * One page of the history list in the Journal's order (D259), strictly before `before`, of the trades that match the
 * filters (D262; `status` alone is the same as a status filter); `nextCursor` is null on the last page.
 */
export async function listJournalHistoryPage(
  db: KairosDatabase,
  options: JournalMatchOptions & { readonly status?: TradeStatus } = {},
): Promise<JournalHistoryPage> {
  const repositories = createKairosRepositories(db);
  const filters = options.filters ?? (options.status === undefined ? NO_JOURNAL_FILTERS : Object.freeze({ ...NO_JOURNAL_FILTERS, status: options.status }));
  return db.transaction('r', [...MATCH_STORES], async () => {
    const found = await collectJournalMatches(repositories, { ...options, filters }, JOURNAL_HISTORY_PAGE_SIZE);
    const last = found.entries[found.entries.length - 1];
    return Object.freeze({ entries: Object.freeze([...found.entries]), nextCursor: found.more && last ? cursorOf(last.trade) : null });
  });
}

/** Every trade matching the filters, in the Journal's order, in one read (the list's totals and its spreadsheet, D262). */
export async function listAllJournalMatches(db: KairosDatabase, options: JournalMatchOptions): Promise<readonly JournalHistoryEntry[]> {
  const repositories = createKairosRepositories(db);
  return db.transaction('r', [...MATCH_STORES], async () => (await collectJournalMatches(repositories, { ...options, before: null }, null)).entries);
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
