import type { EstimatedMarketReference, TimeAssistedTradeSide } from '../application/market-reference';
import type { ChartMarketReference } from '../features/chart';

export type SavedTimeAssistedSnapshotId = string;

/**
 * P23.1 Saved time-assisted snapshot logical contract.
 *
 * Composes existing owners instead of copying them: the P17 market reference,
 * the P22.2 side and instants, and the P22.1 estimates, which already carry
 * their provenance (method, resolution, exact candle, gap, acquisition time).
 * The record keeps the instants exactly as the user entered them plus their
 * UTC normalisation and the device time zone in effect, and the moment it was
 * saved. It is contract-only: no price, no result, no execution identity, no
 * trade relation, and never journal truth.
 */
export interface SavedTimeAssistedSnapshot {
  readonly id: SavedTimeAssistedSnapshotId;
  readonly market: ChartMarketReference;
  readonly side: TimeAssistedTradeSide;
  /** The opening instant exactly as entered, and its UTC normalisation. */
  readonly openedAt: string;
  readonly openedAtUtc: string;
  /** The closing instant exactly as entered (null while still open), and its UTC normalisation. */
  readonly closedAt: string | null;
  readonly closedAtUtc: string | null;
  /** The IANA time zone the instants were entered in (device time zone at save time). */
  readonly inputTimeZone: string;
  readonly opening: EstimatedMarketReference;
  readonly closing: EstimatedMarketReference | null;
  readonly durationMs: number | null;
  readonly savedAt: string;
  readonly isEstimate: true;
  readonly source: 'market-reference';
  /** P25.1 optional user-given label (trimmed, non-empty, at most 80 characters); absent on every released record. */
  readonly label?: string;
}

export function defineSavedTimeAssistedSnapshot(snapshot: SavedTimeAssistedSnapshot): SavedTimeAssistedSnapshot {
  return snapshot;
}
