import type { TimeAssistedTradeSide, TimeAssistedTradeSnapshot } from '../application/market-reference';
import { listSavedTimeAssistedSnapshots, loadSavedTimeAssistedSnapshot, saveSavedTimeAssistedSnapshot, type LoadSavedTimeAssistedSnapshotResult, type SaveSavedTimeAssistedSnapshotResult } from '../application/saved-time-assisted-snapshot';
import { deleteSavedTimeAssistedSnapshot, type DeleteSavedTimeAssistedSnapshotResult } from '../application/saved-time-assisted-snapshot';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import type { MarketDataInstrument } from '../services/market-data/marketDataTypes';
import type { SavedTimeAssistedSnapshot, SavedTimeAssistedSnapshotId } from './savedTimeAssistedSnapshotContract';

export interface AnalysisSavedTimeAssistedSnapshotSummary {
  readonly id: SavedTimeAssistedSnapshotId;
  readonly side: TimeAssistedTradeSide;
  readonly openedAtUtc: string;
  readonly closedAtUtc: string | null;
  readonly savedAt: string;
  /** P25 optional user-given label, present only when the record carries one. */
  readonly label?: string;
}

/** Save, list and load saved time-assisted snapshots for one exact market through the released P23 owners. */
export interface AnalysisSavedTimeAssistedSnapshotPorts {
  save(snapshot: TimeAssistedTradeSnapshot, inputTimeZone: string, label?: string): Promise<SaveSavedTimeAssistedSnapshotResult>;
  list(instrument: MarketDataInstrument): Promise<readonly AnalysisSavedTimeAssistedSnapshotSummary[]>;
  load(savedTimeAssistedSnapshotId: SavedTimeAssistedSnapshotId): Promise<LoadSavedTimeAssistedSnapshotResult>;
  /** P24.1 delete-one; the released P23 owners above are unchanged. */
  remove(savedTimeAssistedSnapshotId: SavedTimeAssistedSnapshotId): Promise<DeleteSavedTimeAssistedSnapshotResult>;
}

const sameMarket = (record: SavedTimeAssistedSnapshot, instrument: MarketDataInstrument): boolean => record.market.venue === instrument.venue && record.market.instrument === instrument.symbol && record.market.source === 'market-reference';

/** Re-presents a saved record as the P22.2 snapshot shape: the estimates exactly as acquired at save time, never re-estimated. */
export function savedTimeAssistedSnapshotToSnapshot(record: SavedTimeAssistedSnapshot): TimeAssistedTradeSnapshot {
  return Object.freeze({
    kind: 'snapshot' as const,
    isEstimate: true as const,
    source: 'market-reference' as const,
    instrument: Object.freeze({ venue: record.market.venue, symbol: record.market.instrument }),
    side: record.side,
    opening: record.opening,
    closing: record.closing,
    durationMs: record.durationMs,
  });
}

/**
 * P23.3 save (one atomic write, fresh id, save moment), P23.4 listing filtered to the
 * exact market (newest save first), P23.4 load-one-by-id. Nothing here re-estimates:
 * a loaded snapshot shows the provenance it was saved with.
 */
export function createAnalysisSavedTimeAssistedSnapshotPorts(db: KairosDatabase = kairosDatabase): AnalysisSavedTimeAssistedSnapshotPorts {
  return {
    save(snapshot, inputTimeZone, label) {
      return saveSavedTimeAssistedSnapshot(db, { snapshot, inputTimeZone, ...(label === undefined ? {} : { label }) });
    },
    async list(instrument) {
      const result = await listSavedTimeAssistedSnapshots(db);
      if (!result.ok) throw new Error(result.reason);
      return result.savedTimeAssistedSnapshots.filter(record => sameMarket(record, instrument)).map(record => Object.freeze({ id: record.id, side: record.side, openedAtUtc: record.openedAtUtc, closedAtUtc: record.closedAtUtc, savedAt: record.savedAt, ...(record.label === undefined ? {} : { label: record.label }) }));
    },
    load(savedTimeAssistedSnapshotId) {
      return loadSavedTimeAssistedSnapshot(db, savedTimeAssistedSnapshotId);
    },
    remove(savedTimeAssistedSnapshotId) {
      return deleteSavedTimeAssistedSnapshot(db, savedTimeAssistedSnapshotId);
    },
  };
}

export const analysisSavedTimeAssistedSnapshotPorts: AnalysisSavedTimeAssistedSnapshotPorts = createAnalysisSavedTimeAssistedSnapshotPorts();
