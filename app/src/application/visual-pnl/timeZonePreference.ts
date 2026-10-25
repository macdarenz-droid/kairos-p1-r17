import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { createKairosRepositories, type MetadataRepository } from '../../data/repositories';
import { projectVisualPnlDayKey } from './dayBucket';

export const visualPnlTimeZonePreferenceMetadataKey = 'preferences.visual-pnl.time-zone.v1';

export type VisualPnlTimeZonePreference = string | null;

export type VisualPnlTimeZonePreferenceWriteResult =
  | Readonly<{ ok: true; timeZone: string }>
  | Readonly<{ ok: false; reason: 'invalid-time-zone' }>;

const VALIDATION_INSTANT = '2000-01-01T00:00:00.000Z';

function isValidTimeZone(timeZone: string): boolean {
  if (timeZone.trim() !== timeZone || timeZone.length === 0) return false;
  return projectVisualPnlDayKey(VALIDATION_INSTANT, timeZone).available;
}

/**
 * Reads the explicit Visual P&L calendar timezone preference through the
 * authoritative metadata repository. Missing or invalid evidence is treated as
 * unconfigured; no device time zone is inferred by reading.
 * `startVisualPnlTimeZoneFromDevice` saves the device's zone once, on first
 * use (D199).
 */
export async function readVisualPnlTimeZonePreference(
  metadata: MetadataRepository,
): Promise<VisualPnlTimeZonePreference> {
  const stored = await metadata.get(visualPnlTimeZonePreferenceMetadataKey);
  if (!stored || !isValidTimeZone(stored.value)) return null;
  return stored.value;
}

/**
 * Persists only an explicitly supplied valid timezone. Persistence remains
 * owned by MetadataRepository; this application module only validates and
 * coordinates the preference contract.
 */
export async function writeVisualPnlTimeZonePreference(
  metadata: MetadataRepository,
  timeZone: string,
  updatedAt: string,
): Promise<VisualPnlTimeZonePreferenceWriteResult> {
  if (!isValidTimeZone(timeZone)) {
    return Object.freeze({ ok: false, reason: 'invalid-time-zone' as const });
  }

  await metadata.put({
    key: visualPnlTimeZonePreferenceMetadataKey,
    value: timeZone,
    updatedAt,
  });

  return Object.freeze({ ok: true, timeZone });
}

export async function clearVisualPnlTimeZonePreference(
  metadata: MetadataRepository,
): Promise<void> {
  await metadata.delete(visualPnlTimeZonePreferenceMetadataKey);
}

export type VisualPnlTimeZoneStart =
  | Readonly<{ kind: 'saved'; timeZone: string }>
  | Readonly<{ kind: 'started-from-device'; timeZone: string }>
  | Readonly<{ kind: 'unconfigured' }>;

/** D199: when no valid zone is saved and this device reports a valid one, save it (first use). A saved zone is never changed here. */
export async function startVisualPnlTimeZoneFromDevice(
  db: KairosDatabase,
  deviceTimeZone: string | null,
  updatedAt: string,
): Promise<VisualPnlTimeZoneStart> {
  // The read and the write share one transaction, so a zone saved meanwhile (Settings in another tab) is never overwritten.
  return runKairosAtomicWrite(db, ['metadata'], async ({ repositories }) => {
    const stored = await repositories.metadata.get(visualPnlTimeZonePreferenceMetadataKey);
    if (stored && isValidTimeZone(stored.value)) return Object.freeze({ kind: 'saved' as const, timeZone: stored.value });
    if (deviceTimeZone === null || !isValidTimeZone(deviceTimeZone)) return Object.freeze({ kind: 'unconfigured' as const });
    await repositories.metadata.put({ key: visualPnlTimeZonePreferenceMetadataKey, value: deviceTimeZone, updatedAt });
    return Object.freeze({ kind: 'started-from-device' as const, timeZone: deviceTimeZone });
  });
}

/** For screens, which never import data/repositories: the saved zone, or null when none is saved. */
export function loadVisualPnlTimeZone(db: KairosDatabase): Promise<VisualPnlTimeZonePreference> {
  return readVisualPnlTimeZonePreference(createKairosRepositories(db).metadata);
}

/** For screens: save a zone the trader chose, as one atomic write (T-053d, the setup's first step). */
export function saveVisualPnlTimeZone(db: KairosDatabase, timeZone: string, dependencies: { readonly now?: () => string } = {}): Promise<VisualPnlTimeZonePreferenceWriteResult> {
  const updatedAt = (dependencies.now ?? (() => new Date().toISOString()))();
  return runKairosAtomicWrite(db, ['metadata'], ({ repositories }) => writeVisualPnlTimeZonePreference(repositories.metadata, timeZone, updatedAt));
}
