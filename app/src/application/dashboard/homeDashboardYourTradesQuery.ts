import { kairosDatabase, type KairosDatabase } from '../../data/database';
import { listJournalHistory, DEFAULT_JOURNAL_HISTORY_LIMIT, type JournalHistoryEntry } from '../journal/historyQuery';

export const YOUR_TRADES_HISTORY_LIMIT = DEFAULT_JOURNAL_HISTORY_LIMIT;
export interface HomeYourTrade {
  readonly id: string;
  readonly symbol: string;
  readonly side: string;
  readonly status: string;
  readonly outcome: 'profit' | 'loss' | 'breakeven' | 'unavailable';
  readonly resultLabel: string;
  readonly amount: string | null;
  readonly currency: string | null;
  readonly source: JournalHistoryEntry['visualPnl']['source'];
  readonly timestamp: string;
}
/** One saved trade per bubble. Consume released P11/P13 results without arithmetic,
 * currency inference, aggregation, or market-provider inputs. */
export function projectHomeYourTrade(entry: JournalHistoryEntry): HomeYourTrade {
  const realized = entry.trade.status === 'closed' && entry.metrics?.state === 'realized';
  const result = realized ? entry.visualPnl : null;
  return Object.freeze({
    id: entry.trade.id, symbol: entry.trade.symbol, side: entry.trade.side, status: entry.trade.status,
    outcome: result?.outcome ?? 'unavailable',
    resultLabel: result?.label ?? (entry.trade.status === 'closed' ? 'Not available' : entry.trade.status[0].toUpperCase()+entry.trade.status.slice(1)),
    amount: result?.amount ?? null, currency: result?.currency ?? null, source: result?.source ?? 'none',
    timestamp: entry.trade.closedAt ?? entry.trade.openedAt ?? entry.trade.updatedAt,
  });
}
export async function loadHomeYourTrades(db: KairosDatabase = kairosDatabase): Promise<readonly HomeYourTrade[]> {
  return Object.freeze((await listJournalHistory(db, {limit: YOUR_TRADES_HISTORY_LIMIT})).map(projectHomeYourTrade));
}
