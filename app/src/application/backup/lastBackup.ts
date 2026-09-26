import type { MetadataRepository } from '../../data/repositories/MetadataRepository';
import type { KairosBackupFile } from './exportBackup';

/** Device-scoped (the released P5 `device.` prefix): never inside a backup, never touched by restore or import. */
export const lastBackupMetadataKey = 'device.backup.last-export.v1' as const;

export interface LastBackupRecord {
  readonly exportedAt: string;
  readonly fileName: string;
  readonly totalRecords: number;
}

export type RecordLastBackupResult =
  | { readonly ok: true; readonly record: LastBackupRecord }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'last-backup-record-failed' };

const isIsoMoment = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

/** Reads the last backup taken on this device; a missing or malformed record reads as never. */
export async function readLastBackup(metadata: MetadataRepository): Promise<LastBackupRecord | null> {
  const stored = await metadata.get(lastBackupMetadataKey);
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored.value);
    if (typeof parsed !== 'object' || parsed === null || (parsed as Record<string, unknown>).version !== 1) return null;
    const { exportedAt, fileName, totalRecords } = parsed as Record<string, unknown>;
    if (!isIsoMoment(exportedAt) || typeof fileName !== 'string' || fileName.length === 0 || typeof totalRecords !== 'number' || !Number.isInteger(totalRecords) || totalRecords < 0) return null;
    return Object.freeze({ exportedAt, fileName, totalRecords });
  } catch {
    return null;
  }
}

/**
 * P34.1: records that a backup file was handed to the browser. Called by the
 * owner that performed the hand-off, after it succeeded; the record is the
 * file's own export moment, name and record count, nothing more.
 */
export async function recordLastBackup(metadata: MetadataRepository, file: KairosBackupFile): Promise<RecordLastBackupResult> {
  const record: LastBackupRecord = Object.freeze({ exportedAt: file.exportedAt, fileName: file.fileName, totalRecords: file.recordCounts.total });
  try {
    await metadata.put({ key: lastBackupMetadataKey, value: JSON.stringify({ version: 1, ...record }), updatedAt: file.exportedAt });
    return { ok: true, record };
  } catch {
    return { ok: false, type: 'storage-error', reason: 'last-backup-record-failed' };
  }
}
