import { kairosDatabase, openKairosDatabase, type KairosDatabase } from '../../data/database';
import { getJournalHistoryEntry, listJournalHistory, type JournalHistoryEntry } from './historyQuery';

export type TradeReviewResult =
  | { readonly kind: 'selection'; readonly entries: readonly JournalHistoryEntry[] }
  | { readonly kind: 'trade'; readonly entry: JournalHistoryEntry }
  | { readonly kind: 'missing' };

/** P12 read orchestration only. The existing hydration owner supplies every fact/result. */
export async function loadTradeReview(id: string | null, db: KairosDatabase = kairosDatabase): Promise<TradeReviewResult> {
  await openKairosDatabase(db);
  if (id === null) return { kind: 'selection', entries: await listJournalHistory(db) };
  const entry = await getJournalHistoryEntry(db, id);
  return entry ? { kind: 'trade', entry } : { kind: 'missing' };
}
