import type { SavedAnalysis, SavedAnalysisId } from '../../app/savedAnalysisContract';
import type { SavedTimeAssistedSnapshot, SavedTimeAssistedSnapshotId } from '../../app/savedTimeAssistedSnapshotContract';
import type { KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import type { ChartMarketReference } from '../../features/chart';

/**
 * P27.1 cross-market saved-record index.
 *
 * A read-only projection over the released P20.2 Saved Analysis listing and the
 * P23.2 saved snapshot listing: one entry per record with its kind, canonical id,
 * P25 label (when present), P17 market reference and the facts each contract
 * already carries. No new store, index or field; nothing is written.
 */
export type SavedRecordKind = 'analysis' | 'snapshot';

export type SavedRecordIndexEntry =
  | Readonly<{ kind: 'analysis'; id: SavedAnalysisId; market: ChartMarketReference; label: string | null; drawingCount: number; riskRewardCount: number; savedAt: null }>
  | Readonly<{ kind: 'snapshot'; id: SavedTimeAssistedSnapshotId; market: ChartMarketReference; label: string | null; side: 'long' | 'short'; openedAtUtc: string; closedAtUtc: string | null; savedAt: string }>;

export interface SavedRecordIndex {
  readonly entries: readonly SavedRecordIndexEntry[];
  /** Distinct markets carrying at least one record, ordered by venue then instrument. */
  readonly markets: readonly ChartMarketReference[];
  readonly counts: Readonly<{ analyses: number; snapshots: number }>;
}

export interface SavedRecordIndexFilter {
  readonly kind?: SavedRecordKind;
  readonly market?: Pick<ChartMarketReference, 'venue' | 'instrument'>;
}

const marketKey = (market: Pick<ChartMarketReference, 'venue' | 'instrument'>): string => `${market.venue}|${market.instrument}`;

function analysisEntry(record: SavedAnalysis): SavedRecordIndexEntry {
  return Object.freeze({ kind: 'analysis' as const, id: record.id, market: Object.freeze({ ...record.market }), label: record.label ?? null, drawingCount: record.drawings.length, riskRewardCount: record.riskRewards.length, savedAt: null });
}

function snapshotEntry(record: SavedTimeAssistedSnapshot): SavedRecordIndexEntry {
  return Object.freeze({ kind: 'snapshot' as const, id: record.id, market: Object.freeze({ ...record.market }), label: record.label ?? null, side: record.side, openedAtUtc: record.openedAtUtc, closedAtUtc: record.closedAtUtc, savedAt: record.savedAt });
}

/**
 * Snapshots first, newest save first; Saved Analyses after them by label then id
 * (the P20.1 contract carries no save moment, so none is invented). Ties by id.
 */
export function orderSavedRecordIndexEntries(entries: readonly SavedRecordIndexEntry[]): readonly SavedRecordIndexEntry[] {
  return Object.freeze([...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'snapshot' ? -1 : 1;
    if (a.kind === 'snapshot' && b.kind === 'snapshot' && a.savedAt !== b.savedAt) return b.savedAt.localeCompare(a.savedAt);
    const labelA = a.label ?? '', labelB = b.label ?? '';
    if (labelA !== labelB) { if (labelA === '') return 1; if (labelB === '') return -1; return labelA.localeCompare(labelB); }
    return a.id.localeCompare(b.id);
  }));
}

export function buildSavedRecordIndex(analyses: readonly SavedAnalysis[], snapshots: readonly SavedTimeAssistedSnapshot[]): SavedRecordIndex {
  const entries = orderSavedRecordIndexEntries([...analyses.map(analysisEntry), ...snapshots.map(snapshotEntry)]);
  const markets = new Map<string, ChartMarketReference>();
  for (const entry of entries) if (!markets.has(marketKey(entry.market))) markets.set(marketKey(entry.market), entry.market);
  return Object.freeze({
    entries,
    markets: Object.freeze([...markets.values()].sort((a, b) => a.venue.localeCompare(b.venue) || a.instrument.localeCompare(b.instrument))),
    counts: Object.freeze({ analyses: analyses.length, snapshots: snapshots.length }),
  });
}

export function filterSavedRecordIndex(index: SavedRecordIndex, filter: SavedRecordIndexFilter): readonly SavedRecordIndexEntry[] {
  return Object.freeze(index.entries.filter((entry) => (filter.kind === undefined || entry.kind === filter.kind) && (filter.market === undefined || marketKey(entry.market) === marketKey(filter.market))));
}

/** Reads both released listings and builds the index; the database and its repositories stay the released owners. */
export async function listSavedRecordIndex(db: KairosDatabase): Promise<SavedRecordIndex> {
  const repositories = createKairosRepositories(db);
  const [analyses, snapshots] = await Promise.all([repositories.savedAnalyses.listAll(), repositories.savedTimeAssistedSnapshots.listAll()]);
  return buildSavedRecordIndex(analyses, snapshots);
}
