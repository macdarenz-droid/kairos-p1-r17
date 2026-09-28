import type { MetadataRepository } from '../../data/repositories';
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
 * unconfigured; no browser/device timezone is inferred.
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
