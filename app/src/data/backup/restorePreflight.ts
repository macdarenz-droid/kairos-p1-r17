import type { KairosDatabase } from '../database/KairosDatabase';
import { DatabaseIntegrityError } from '../database/integrity';
import { KAIROS_DB_SCHEMA_VERSION } from '../database/schema';
import { isKairosDeviceScopedMetadataKey } from '../repositories';
import { createKairosDatabaseSnapshot } from './backupSnapshot';
import type { KairosCurrentBackupEnvelope, KairosBackupRecordCountsV5 } from './backupFormat';
import { parseKairosBackup, serializeKairosBackup } from './backupSerialization';

export type KairosRestorePreflightCode =
  | 'INCOMPATIBLE_DATABASE_SCHEMA'
  | 'DUPLICATE_METADATA_KEY'
  | 'DUPLICATE_TRADE_ID'
  | 'DUPLICATE_TRADE_PLAN_ID'
  | 'DUPLICATE_TRADE_EXECUTION_ID'
  | 'DUPLICATE_TRADE_FEE_ID'
  | 'DUPLICATE_SAVED_ANALYSIS_ID'
  | 'DUPLICATE_SAVED_TIME_ASSISTED_SNAPSHOT_ID'
  | 'DUPLICATE_TRADE_DISCIPLINE_ID'
  | 'DUPLICATE_TRADE_DISCIPLINE_TRADE_ID'
  | 'INVALID_TRADE_REFERENCE';

export class KairosRestorePreflightError extends Error {
  constructor(
    public readonly code: KairosRestorePreflightCode,
    message: string,
  ) {
    super(message);
    this.name = 'KairosRestorePreflightError';
  }
}

export interface KairosRestorePreviewV2 {
  readonly formatVersion: number;
  readonly databaseSchemaVersion: number;
  readonly exportedAt: string;
  readonly metadataRecords: number;
  readonly tradeRecords: number;
  readonly tradePlanRecords: number;
  readonly tradeExecutionRecords: number;
  readonly tradeFeeRecords: number;
  readonly savedAnalysisRecords: number;
  readonly savedTimeAssistedSnapshotRecords: number;
  readonly tradeDisciplineRecords: number;
  readonly totalRecords: number;
}

export interface KairosRecoverySnapshotV2 {
  readonly envelope: KairosCurrentBackupEnvelope;
  readonly serialized: string;
}

export interface KairosPreparedRestoreV2 {
  readonly incoming: KairosCurrentBackupEnvelope;
  readonly preview: KairosRestorePreviewV2;
  readonly recovery: KairosRecoverySnapshotV2;
}

export const KAIROS_RAW_RECOVERY_FORMAT = 'kairos-raw-recovery' as const;

/**
 * A plain copy of every store, made when the current data fails a core check
 * and so cannot become a normal backup. It may not restore; it keeps the rows.
 */
export interface KairosRawRecoverySnapshot {
  readonly kind: 'raw';
  readonly exportedAt: string;
  readonly serialized: string;
  readonly recordCounts: KairosBackupRecordCountsV5;
}

export type KairosRecoveryCopy = KairosRecoverySnapshotV2 | KairosRawRecoverySnapshot;

export interface KairosPreparedRestoreWithRecovery {
  readonly incoming: KairosCurrentBackupEnvelope;
  readonly preview: KairosRestorePreviewV2;
  readonly recovery: KairosRecoveryCopy;
}

export function isRawRecoveryCopy(recovery: KairosRecoveryCopy): recovery is KairosRawRecoverySnapshot {
  return 'kind' in recovery && recovery.kind === 'raw';
}

function assertUnique(values: readonly string[], code: KairosRestorePreflightCode, label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new KairosRestorePreflightError(code, `Backup contains duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function assertRestoreCompatibility(envelope: KairosCurrentBackupEnvelope): void {
  // parseKairosBackup has already migrated every supported V1–V7 backup to the current restore model (format 8, schema 9).
  const compatible = envelope.databaseSchemaVersion === KAIROS_DB_SCHEMA_VERSION;
  if (!compatible) {
    throw new KairosRestorePreflightError(
      'INCOMPATIBLE_DATABASE_SCHEMA',
      'Backup database schema is not supported by this build.',
    );
  }

  assertUnique(envelope.payload.metadata.map((record) => record.key), 'DUPLICATE_METADATA_KEY', 'metadata key');
  assertUnique(envelope.payload.trades.map((record) => record.id), 'DUPLICATE_TRADE_ID', 'trade id');
  assertUnique(envelope.payload.tradePlans.map((record) => record.id), 'DUPLICATE_TRADE_PLAN_ID', 'trade plan id');
  assertUnique(envelope.payload.tradeExecutions.map((record) => record.id), 'DUPLICATE_TRADE_EXECUTION_ID', 'trade execution id');
  assertUnique(envelope.payload.tradeFees.map((record) => record.id), 'DUPLICATE_TRADE_FEE_ID', 'trade fee id');
  assertUnique(envelope.payload.savedAnalyses.map((record) => record.id), 'DUPLICATE_SAVED_ANALYSIS_ID', 'Saved Analysis id');
  assertUnique(envelope.payload.savedTimeAssistedSnapshots.map((record) => record.id), 'DUPLICATE_SAVED_TIME_ASSISTED_SNAPSHOT_ID', 'saved time-assisted snapshot id');
  assertUnique(envelope.payload.tradeDiscipline.map((record) => record.id), 'DUPLICATE_TRADE_DISCIPLINE_ID', 'trade discipline id');
  assertUnique(envelope.payload.tradeDiscipline.map((record) => record.tradeId), 'DUPLICATE_TRADE_DISCIPLINE_TRADE_ID', 'trade discipline trade id');

  const tradeIds = new Set(envelope.payload.trades.map((record) => record.id));
  const executionIds = new Set(envelope.payload.tradeExecutions.map((record) => record.id));
  const referencesValid =
    envelope.payload.tradePlans.every((record) => tradeIds.has(record.tradeId)) &&
    envelope.payload.tradeExecutions.every((record) => tradeIds.has(record.tradeId)) &&
    envelope.payload.tradeFees.every(
      (record) => tradeIds.has(record.tradeId) && (record.executionId === null || executionIds.has(record.executionId)),
    ) &&
    envelope.payload.tradeDiscipline.every((record) => tradeIds.has(record.tradeId));
  if (!referencesValid) {
    throw new KairosRestorePreflightError('INVALID_TRADE_REFERENCE', 'Backup trade references are not internally consistent.');
  }
}

function createRestorePreview(envelope: KairosCurrentBackupEnvelope): KairosRestorePreviewV2 {
  return Object.freeze({
    formatVersion: envelope.formatVersion,
    databaseSchemaVersion: envelope.databaseSchemaVersion,
    exportedAt: envelope.exportedAt,
    metadataRecords: envelope.recordCounts.metadata,
    tradeRecords: envelope.recordCounts.trades,
    tradePlanRecords: envelope.recordCounts.tradePlans,
    tradeExecutionRecords: envelope.recordCounts.tradeExecutions,
    tradeFeeRecords: envelope.recordCounts.tradeFees,
    savedAnalysisRecords: envelope.recordCounts.savedAnalyses,
    savedTimeAssistedSnapshotRecords: envelope.recordCounts.savedTimeAssistedSnapshots,
    tradeDisciplineRecords: envelope.recordCounts.tradeDiscipline,
    totalRecords: envelope.recordCounts.total,
  });
}

export function preflightKairosRestore(serializedIncomingBackup: string): {
  readonly incoming: KairosCurrentBackupEnvelope;
  readonly preview: KairosRestorePreviewV2;
} {
  const incoming = parseKairosBackup(serializedIncomingBackup);
  assertRestoreCompatibility(incoming);
  return Object.freeze({ incoming, preview: createRestorePreview(incoming) });
}

export async function createKairosRecoverySnapshot(
  db: KairosDatabase,
): Promise<KairosRecoverySnapshotV2> {
  const envelope = await createKairosDatabaseSnapshot(db);
  return Object.freeze({ envelope, serialized: serializeKairosBackup(envelope) });
}

export async function prepareKairosRestore(
  db: KairosDatabase,
  serializedIncomingBackup: string,
): Promise<KairosPreparedRestoreV2> {
  const preflight = preflightKairosRestore(serializedIncomingBackup);
  const recovery = await createKairosRecoverySnapshot(db);
  return Object.freeze({ incoming: preflight.incoming, preview: preflight.preview, recovery });
}

/** Reads every store as it is, with no integrity check; device-scoped metadata stays out, as in a backup. */
export async function createKairosRawRecoverySnapshot(db: KairosDatabase, exportedAt: Date = new Date()): Promise<KairosRawRecoverySnapshot> {
  const stores: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    const rows = await table.toArray();
    stores[table.name] = table.name === 'metadata'
      ? rows.filter((row) => !(typeof row === 'object' && row !== null && typeof (row as { key?: unknown }).key === 'string' && isKairosDeviceScopedMetadataKey((row as { key: string }).key)))
      : rows;
  }
  const count = (name: string) => stores[name]?.length ?? 0;
  const recordCounts: KairosBackupRecordCountsV5 = Object.freeze({
    metadata: count('metadata'), trades: count('trades'), tradePlans: count('tradePlans'), tradeExecutions: count('tradeExecutions'), tradeFees: count('tradeFees'),
    savedAnalyses: count('savedAnalyses'), savedTimeAssistedSnapshots: count('savedTimeAssistedSnapshots'), tradeDiscipline: count('tradeDiscipline'),
    total: Object.values(stores).reduce((sum, rows) => sum + rows.length, 0),
  });
  const iso = exportedAt.toISOString();
  return Object.freeze({
    kind: 'raw' as const,
    exportedAt: iso,
    serialized: JSON.stringify({ format: KAIROS_RAW_RECOVERY_FORMAT, exportedAt: iso, stores }, null, 2),
    recordCounts,
  });
}

/**
 * Like `prepareKairosRestore`, but never blocked by the current data: when it
 * fails a core check, the recovery file is a raw copy instead of a backup.
 * The incoming backup is still fully checked, and the replacement and the
 * after-restore verification stay strict.
 */
export async function prepareKairosRestoreWithRecovery(
  db: KairosDatabase,
  serializedIncomingBackup: string,
): Promise<KairosPreparedRestoreWithRecovery> {
  const preflight = preflightKairosRestore(serializedIncomingBackup);
  let recovery: KairosRecoveryCopy;
  try {
    recovery = await createKairosRecoverySnapshot(db);
  } catch (error) {
    if (!(error instanceof DatabaseIntegrityError)) throw error;
    recovery = await createKairosRawRecoverySnapshot(db);
  }
  return Object.freeze({ incoming: preflight.incoming, preview: preflight.preview, recovery });
}
