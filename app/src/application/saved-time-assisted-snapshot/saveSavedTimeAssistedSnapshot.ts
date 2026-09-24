import type { SavedTimeAssistedSnapshot, SavedTimeAssistedSnapshotId } from '../../domain/saved-records/savedTimeAssistedSnapshotContract';
import { createSavedTimeAssistedSnapshotId } from '../../domain/saved-records/savedTimeAssistedSnapshotIdentity';
import { normalizeSavedRecordLabel } from '../../domain/saved-records/savedRecordLabel';
import type { KairosDatabase } from '../../data/database/KairosDatabase';
import { runKairosAtomicWrite } from '../../data/database/transactions';
import type { TimeAssistedTradeSnapshot } from '../market-reference';

export interface SaveSavedTimeAssistedSnapshotInput {
  /** A composed P22.2 snapshot (never an invalid result); its estimates carry the entered instants as `requestedAt`. */
  readonly snapshot: TimeAssistedTradeSnapshot;
  /** The IANA time zone the instants were entered in (device time zone). */
  readonly inputTimeZone: string;
  /** P25.1 optional user-given label; blank means no label. */
  readonly label?: string;
}

export interface SaveSavedTimeAssistedSnapshotOptions {
  /** Save-moment clock; defaults to Date.now. */
  readonly now?: () => number;
}

export type SaveSavedTimeAssistedSnapshotInvalidReason = 'snapshot-not-composed' | 'time-zone-invalid' | 'opened-at-invalid' | 'closed-at-invalid' | 'label-invalid';

export type SaveSavedTimeAssistedSnapshotResult =
  | {
      readonly ok: true;
      readonly savedTimeAssistedSnapshotId: SavedTimeAssistedSnapshotId;
      readonly record: SavedTimeAssistedSnapshot;
    }
  | {
      readonly ok: false;
      readonly type: 'invalid-input';
      readonly reason: SaveSavedTimeAssistedSnapshotInvalidReason;
    }
  | {
      readonly ok: false;
      readonly type: 'storage-error';
      readonly reason: 'saved-time-assisted-snapshot-save-failed';
    };

const parseInstant = (value: unknown): number | null => {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

/**
 * P23.3 saved time-assisted snapshot application save orchestration.
 *
 * Owns only: composing the P23.1 record from a composed P22.2 snapshot (the
 * entered instants come from the estimates' own `requestedAt`, so the saved
 * record can never disagree with what was estimated), UTC normalisation of
 * those instants, the save moment, fresh-id allocation and one atomic
 * repository write. Estimate semantics stay with P22.1/P22.2, the logical
 * contract with P23.1 and raw persistence with P23.2. No list/load/delete.
 */
export async function saveSavedTimeAssistedSnapshot(
  db: KairosDatabase,
  input: SaveSavedTimeAssistedSnapshotInput,
  options: SaveSavedTimeAssistedSnapshotOptions = {},
): Promise<SaveSavedTimeAssistedSnapshotResult> {
  const invalid = (reason: SaveSavedTimeAssistedSnapshotInvalidReason): SaveSavedTimeAssistedSnapshotResult => Object.freeze({ ok: false as const, type: 'invalid-input' as const, reason });
  const snapshot = input.snapshot;
  if (snapshot === null || typeof snapshot !== 'object' || snapshot.kind !== 'snapshot' || snapshot.isEstimate !== true || snapshot.source !== 'market-reference') return invalid('snapshot-not-composed');
  if (typeof input.inputTimeZone !== 'string' || input.inputTimeZone.trim() === '') return invalid('time-zone-invalid');
  const openedAt = snapshot.opening.requestedAt;
  const openedMs = parseInstant(openedAt);
  if (openedMs === null) return invalid('opened-at-invalid');
  const closedAt = snapshot.closing === null ? null : snapshot.closing.requestedAt;
  const closedMs = closedAt === null ? null : parseInstant(closedAt);
  if (closedAt !== null && closedMs === null) return invalid('closed-at-invalid');
  const label = normalizeSavedRecordLabel(input.label);
  if (label.kind === 'invalid') return invalid('label-invalid');

  const savedTimeAssistedSnapshotId = createSavedTimeAssistedSnapshotId();
  const record: SavedTimeAssistedSnapshot = Object.freeze({
    id: savedTimeAssistedSnapshotId,
    market: Object.freeze({ venue: snapshot.instrument.venue, instrument: snapshot.instrument.symbol, source: 'market-reference' as const }),
    side: snapshot.side,
    openedAt,
    openedAtUtc: new Date(openedMs).toISOString(),
    closedAt,
    closedAtUtc: closedMs === null ? null : new Date(closedMs).toISOString(),
    inputTimeZone: input.inputTimeZone,
    opening: structuredClone(snapshot.opening),
    closing: snapshot.closing === null ? null : structuredClone(snapshot.closing),
    durationMs: snapshot.durationMs,
    savedAt: new Date((options.now ?? Date.now)()).toISOString(),
    isEstimate: true as const,
    source: 'market-reference' as const,
    ...(label.kind === 'label' ? { label: label.label } : {}),
  });

  try {
    await runKairosAtomicWrite(db, ['savedTimeAssistedSnapshots'], async ({ repositories }) => {
      await repositories.savedTimeAssistedSnapshots.put(record);
    });
  } catch {
    return { ok: false, type: 'storage-error', reason: 'saved-time-assisted-snapshot-save-failed' };
  }

  return { ok: true, savedTimeAssistedSnapshotId, record };
}
