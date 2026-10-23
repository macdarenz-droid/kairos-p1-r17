/**
 * T-054a (D226): when a backup is due. The setting is a preference that travels with backups (D110); "Later" is this
 * device's own (`device.*`, never in a backup, kept by a restore). A missing or damaged record reads as the default.
 */

import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { createKairosRepositories, type MetadataRepository } from '../../data/repositories';
import { projectVisualPnlDayKey } from '../visual-pnl/dayBucket';
import { readVisualPnlTimeZonePreference } from '../visual-pnl/timeZonePreference';
import { readLastBackup } from './lastBackup';

export const backupReminderMetadataKey = 'preferences.backup-reminder.v1';
export const backupReminderLaterMetadataKey = 'device.backup.reminder-later.v1';

/** Days between backups, or null for "Never". */
export type BackupReminderEvery = 7 | 14 | 30 | null;
export const BACKUP_REMINDER_EVERY_CHOICES: readonly BackupReminderEvery[] = Object.freeze([7, 14, 30, null]);
export const BACKUP_REMINDER_DEFAULT_EVERY: BackupReminderEvery = 7;
/** Trades created since the last backup that make one due, whatever its age. */
export const BACKUP_REMINDER_TRADES = 20;
/** How long "Later" holds the reminder. */
export const BACKUP_REMINDER_LATER_MS = 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BackupReminder {
  readonly due: boolean;
  /** Why it is due: never backed up on this device, too long ago, or many trades since; null when not due. */
  readonly reason: 'never' | 'old' | 'many-trades' | null;
  readonly lastBackupAt: string | null;
  /** Whole days (24 hours each) since the last backup, for the rules; null when there was none. */
  readonly daysSince: number | null;
  /** Calendar days since the last backup in the saved time zone, else the phone's (24-hour days without either), for the words. */
  readonly calendarDaysSince: number | null;
  /** Trades (any source) created after the last backup; every trade when there was none. */
  readonly tradesSince: number;
  readonly every: BackupReminderEvery;
}

const isEvery = (value: unknown): value is BackupReminderEvery => value === null || value === 7 || value === 14 || value === 30;
const isInstant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;

function parseRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && (parsed as Record<string, unknown>).version === 1 ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** The reminder setting; missing or damaged reads as every 7 days. */
export async function readBackupReminderSetting(metadata: MetadataRepository): Promise<BackupReminderEvery> {
  const stored = await metadata.get(backupReminderMetadataKey);
  const record = stored ? parseRecord(stored.value) : null;
  return record !== null && isEvery(record.every) ? record.every : BACKUP_REMINDER_DEFAULT_EVERY;
}

async function readLaterAt(metadata: MetadataRepository): Promise<string | null> {
  const stored = await metadata.get(backupReminderLaterMetadataKey);
  const record = stored ? parseRecord(stored.value) : null;
  return record !== null && isInstant(record.laterAt) ? record.laterAt : null;
}

/** Calendar days from one instant to another in a time zone; null without a zone or a readable day. */
function calendarDaysBetween(from: string, to: string, timeZone: string | null): number | null {
  if (timeZone === null) return null;
  const start = projectVisualPnlDayKey(from, timeZone);
  const end = projectVisualPnlDayKey(to, timeZone);
  if (!start.available || !end.available) return null;
  return Math.max(0, Math.round((Date.parse(`${end.dayKey}T00:00:00Z`) - Date.parse(`${start.dayKey}T00:00:00Z`)) / DAY_MS));
}

/** The phone's own time zone, which dates follow when none is saved; null when the browser cannot say. */
function deviceTimeZone(): string | null {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/** Reads the last backup, the setting, "Later" and the trades, and says whether a backup is due now. */
export async function loadBackupReminder(db: KairosDatabase, dependencies: { readonly now?: () => string; readonly deviceTimeZone?: () => string | null } = {}): Promise<BackupReminder> {
  const now = Date.parse((dependencies.now ?? wallClock)());
  const repositories = createKairosRepositories(db);
  const last = await readLastBackup(repositories.metadata);
  const every = await readBackupReminderSetting(repositories.metadata);
  const laterAt = await readLaterAt(repositories.metadata);
  const trades = await repositories.trades.count();
  const tradesSince = last === null ? trades : await repositories.trades.countCreatedAfter(last.exportedAt);
  const daysSince = last === null ? null : Math.max(0, Math.floor((now - Date.parse(last.exportedAt)) / DAY_MS));
  // The saved zone, else the phone's: the zone the date beside the words is shown in (T-054b fix r1).
  const zone = (await readVisualPnlTimeZonePreference(repositories.metadata)) ?? (dependencies.deviceTimeZone ?? deviceTimeZone)();
  const calendarDaysSince = last === null ? null : calendarDaysBetween(last.exportedAt, new Date(now).toISOString(), zone) ?? daysSince;
  const held = laterAt !== null && now - Date.parse(laterAt) < BACKUP_REMINDER_LATER_MS;
  const reason: BackupReminder['reason'] = trades === 0 || every === null || held ? null
    : last === null ? 'never'
      : daysSince !== null && daysSince >= every ? 'old'
        : tradesSince >= BACKUP_REMINDER_TRADES ? 'many-trades'
          : null;
  return Object.freeze({ due: reason !== null, reason, lastBackupAt: last?.exportedAt ?? null, daysSince, calendarDaysSince, tradesSince, every });
}

export type BackupReminderWriteResult = { readonly ok: true } | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'backup-reminder-save-failed' };

async function putRecord(db: KairosDatabase, key: string, value: Record<string, unknown>, now: () => string): Promise<BackupReminderWriteResult> {
  try {
    const updatedAt = now();
    await runKairosAtomicWrite(db, ['metadata'], async ({ repositories }) => {
      await repositories.metadata.put({ key, value: JSON.stringify({ version: 1, ...value }), updatedAt });
    });
    return { ok: true };
  } catch {
    return { ok: false, type: 'storage-error', reason: 'backup-reminder-save-failed' };
  }
}

const wallClock = (): string => new Date().toISOString();

/** "Remind me": every 7, 14 or 30 days, or never. */
export function saveBackupReminderSetting(db: KairosDatabase, every: BackupReminderEvery, dependencies: { readonly now?: () => string } = {}): Promise<BackupReminderWriteResult> {
  return putRecord(db, backupReminderMetadataKey, { every }, dependencies.now ?? wallClock);
}

/** "Later": the reminder stays away for 24 hours on this device. */
export function remindBackupLater(db: KairosDatabase, dependencies: { readonly now?: () => string } = {}): Promise<BackupReminderWriteResult> {
  const now = dependencies.now ?? wallClock;
  return putRecord(db, backupReminderLaterMetadataKey, { laterAt: now() }, now);
}
