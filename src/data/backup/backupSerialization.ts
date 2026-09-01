import {
  KAIROS_BACKUP_FORMAT_NAME,
  KAIROS_BACKUP_FORMAT_VERSION,
  type KairosBackupEnvelope,
  type KairosBackupEnvelopeV2,
} from './backupFormat';
import { KairosBackupValidationError, validateKairosBackupEnvelope } from './backupValidation';

function migrateLegacyBackupToCurrent(envelope: KairosBackupEnvelope): KairosBackupEnvelopeV2 {
  if (envelope.formatVersion === KAIROS_BACKUP_FORMAT_VERSION) return envelope;

  return Object.freeze({
    formatName: KAIROS_BACKUP_FORMAT_NAME,
    formatVersion: KAIROS_BACKUP_FORMAT_VERSION,
    appVersion: envelope.appVersion,
    buildId: envelope.buildId,
    exportedAt: envelope.exportedAt,
    databaseSchemaVersion: 2 as const,
    recordCounts: Object.freeze({
      metadata: envelope.payload.metadata.length,
      trades: 0,
      tradePlans: 0,
      tradeExecutions: 0,
      tradeFees: 0,
      total: envelope.payload.metadata.length,
    }),
    payload: Object.freeze({
      metadata: Object.freeze(envelope.payload.metadata.map((record) => ({ ...record }))),
      trades: Object.freeze([]),
      tradePlans: Object.freeze([]),
      tradeExecutions: Object.freeze([]),
      tradeFees: Object.freeze([]),
    }),
  });
}

export function serializeKairosBackup(envelope: KairosBackupEnvelope): string {
  validateKairosBackupEnvelope(envelope);
  return JSON.stringify(envelope);
}

export function parseKairosBackup(serialized: string): KairosBackupEnvelopeV2 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new KairosBackupValidationError('INVALID_JSON', 'Backup is not valid JSON.');
  }
  const validated = validateKairosBackupEnvelope(parsed);
  const migrated = migrateLegacyBackupToCurrent(validated);
  return validateKairosBackupEnvelope(migrated) as KairosBackupEnvelopeV2;
}
