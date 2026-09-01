import type { KairosDatabase } from '../database/KairosDatabase';
import { createKairosDatabaseSnapshot } from './backupSnapshot';
import type { KairosBackupEnvelopeV2 } from './backupFormat';
import { parseKairosBackup, serializeKairosBackup } from './backupSerialization';

export type KairosRestorePreflightCode =
  | 'INCOMPATIBLE_DATABASE_SCHEMA'
  | 'DUPLICATE_METADATA_KEY'
  | 'DUPLICATE_TRADE_ID'
  | 'DUPLICATE_TRADE_PLAN_ID'
  | 'DUPLICATE_TRADE_EXECUTION_ID'
  | 'DUPLICATE_TRADE_FEE_ID'
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
  readonly totalRecords: number;
}

export interface KairosRecoverySnapshotV2 {
  readonly envelope: KairosBackupEnvelopeV2;
  readonly serialized: string;
}

export interface KairosPreparedRestoreV2 {
  readonly incoming: KairosBackupEnvelopeV2;
  readonly preview: KairosRestorePreviewV2;
  readonly recovery: KairosRecoverySnapshotV2;
}

function assertUnique(values: readonly string[], code: KairosRestorePreflightCode, label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new KairosRestorePreflightError(code, `Backup contains duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function assertRestoreCompatibility(envelope: KairosBackupEnvelopeV2): void {
  // parseKairosBackup has already migrated supported V1 backups to the V2 restore model.
  if (envelope.databaseSchemaVersion !== 2) {
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

  const tradeIds = new Set(envelope.payload.trades.map((record) => record.id));
  const executionIds = new Set(envelope.payload.tradeExecutions.map((record) => record.id));
  const referencesValid =
    envelope.payload.tradePlans.every((record) => tradeIds.has(record.tradeId)) &&
    envelope.payload.tradeExecutions.every((record) => tradeIds.has(record.tradeId)) &&
    envelope.payload.tradeFees.every(
      (record) => tradeIds.has(record.tradeId) && (record.executionId === null || executionIds.has(record.executionId)),
    );
  if (!referencesValid) {
    throw new KairosRestorePreflightError('INVALID_TRADE_REFERENCE', 'Backup trade references are not internally consistent.');
  }
}

function createRestorePreview(envelope: KairosBackupEnvelopeV2): KairosRestorePreviewV2 {
  return Object.freeze({
    formatVersion: envelope.formatVersion,
    databaseSchemaVersion: envelope.databaseSchemaVersion,
    exportedAt: envelope.exportedAt,
    metadataRecords: envelope.recordCounts.metadata,
    tradeRecords: envelope.recordCounts.trades,
    tradePlanRecords: envelope.recordCounts.tradePlans,
    tradeExecutionRecords: envelope.recordCounts.tradeExecutions,
    tradeFeeRecords: envelope.recordCounts.tradeFees,
    totalRecords: envelope.recordCounts.total,
  });
}

export function preflightKairosRestore(serializedIncomingBackup: string): {
  readonly incoming: KairosBackupEnvelopeV2;
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
