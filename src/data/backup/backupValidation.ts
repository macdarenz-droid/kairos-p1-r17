import { parsePositiveDecimalString, validateTradeRecord } from '../../domain/trades';
import {
  KAIROS_BACKUP_FORMAT_NAME,
  KAIROS_BACKUP_FORMAT_VERSION,
  KAIROS_LEGACY_BACKUP_FORMAT_VERSION,
  type KairosBackupEnvelope,
  type KairosBackupEnvelopeV1,
  type KairosBackupEnvelopeV2,
} from './backupFormat';

export type KairosBackupValidationCode =
  | 'INVALID_JSON'
  | 'INVALID_ROOT'
  | 'FORMAT_NAME_MISMATCH'
  | 'UNSUPPORTED_FORMAT_VERSION'
  | 'INVALID_HEADER'
  | 'INVALID_RECORD_COUNTS'
  | 'INVALID_PAYLOAD';

export class KairosBackupValidationError extends Error {
  constructor(
    public readonly code: KairosBackupValidationCode,
    message: string,
  ) {
    super(message);
    this.name = 'KairosBackupValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoDate(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isMetadataRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.key) &&
    typeof value.value === 'string' &&
    isIsoDate(value.updatedAt)
  );
}

function isTradeRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.symbol) ||
    !['stock', 'forex', 'crypto', 'futures', 'options', 'other'].includes(String(value.marketType)) ||
    !['long', 'short'].includes(String(value.side)) ||
    !['draft', 'open', 'closed', 'cancelled'].includes(String(value.status)) ||
    !['manual', 'paper', 'replay', 'import', 'broker-import'].includes(String(value.source)) ||
    !(value.openedAt === null || isIsoDate(value.openedAt)) ||
    !(value.closedAt === null || isIsoDate(value.closedAt)) ||
    !isIsoDate(value.createdAt) ||
    !isIsoDate(value.updatedAt)
  ) return false;
  return validateTradeRecord(value as never).ok;
}

function isTradePlanRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const decimalOrNull = (candidate: unknown) => candidate === null || (typeof candidate === 'string' && parsePositiveDecimalString(candidate).ok);
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.tradeId) &&
    decimalOrNull(value.plannedEntryPrice) &&
    decimalOrNull(value.plannedStopPrice) &&
    decimalOrNull(value.plannedTargetPrice) &&
    decimalOrNull(value.plannedQuantity) &&
    isIsoDate(value.createdAt) &&
    isIsoDate(value.updatedAt)
  );
}

function isTradeExecutionRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.tradeId) &&
    (value.type === 'entry' || value.type === 'exit') &&
    typeof value.price === 'string' && parsePositiveDecimalString(value.price).ok &&
    typeof value.quantity === 'string' && parsePositiveDecimalString(value.quantity).ok &&
    isIsoDate(value.executedAt) &&
    isIsoDate(value.createdAt)
  );
}

function isTradeFeeRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.tradeId) &&
    (value.executionId === null || isNonEmptyString(value.executionId)) &&
    typeof value.amount === 'string' && parsePositiveDecimalString(value.amount).ok &&
    isNonEmptyString(value.currency) &&
    isIsoDate(value.createdAt)
  );
}

function validateCommonHeader(input: Record<string, unknown>): void {
  if (
    !isNonEmptyString(input.appVersion) ||
    !isNonEmptyString(input.buildId) ||
    !isIsoDate(input.exportedAt) ||
    !Number.isInteger(input.databaseSchemaVersion) ||
    (input.databaseSchemaVersion as number) < 1
  ) {
    throw new KairosBackupValidationError('INVALID_HEADER', 'Backup header is incomplete or invalid.');
  }
}

function validateV1(input: Record<string, unknown>): KairosBackupEnvelopeV1 {
  if (input.databaseSchemaVersion !== 1) {
    throw new KairosBackupValidationError('INVALID_HEADER', 'Backup format V1 must describe database schema V1.');
  }
  if (!isRecord(input.payload) || !Array.isArray(input.payload.metadata) || !input.payload.metadata.every(isMetadataRecord)) {
    throw new KairosBackupValidationError('INVALID_PAYLOAD', 'Backup V1 metadata payload is invalid.');
  }
  if (!isRecord(input.recordCounts)) {
    throw new KairosBackupValidationError('INVALID_RECORD_COUNTS', 'Backup record counts are invalid.');
  }
  const count = input.payload.metadata.length;
  if (input.recordCounts.metadata !== count || input.recordCounts.total !== count) {
    throw new KairosBackupValidationError('INVALID_RECORD_COUNTS', 'Backup record counts do not match the payload.');
  }
  return input as unknown as KairosBackupEnvelopeV1;
}

function validateV2(input: Record<string, unknown>): KairosBackupEnvelopeV2 {
  if (input.databaseSchemaVersion !== 2) {
    throw new KairosBackupValidationError('INVALID_HEADER', 'Backup format V2 must describe database schema V2.');
  }
  if (!isRecord(input.payload)) {
    throw new KairosBackupValidationError('INVALID_PAYLOAD', 'Backup V2 payload is invalid.');
  }
  const payload = input.payload;
  const validators: Array<[string, (value: unknown) => boolean]> = [
    ['metadata', isMetadataRecord],
    ['trades', isTradeRecord],
    ['tradePlans', isTradePlanRecord],
    ['tradeExecutions', isTradeExecutionRecord],
    ['tradeFees', isTradeFeeRecord],
  ];
  for (const [key, validator] of validators) {
    const records = payload[key];
    if (!Array.isArray(records) || !records.every(validator)) {
      throw new KairosBackupValidationError('INVALID_PAYLOAD', `Backup V2 ${key} payload is invalid.`);
    }
  }
  if (!isRecord(input.recordCounts)) {
    throw new KairosBackupValidationError('INVALID_RECORD_COUNTS', 'Backup record counts are invalid.');
  }
  const expected = {
    metadata: (payload.metadata as unknown[]).length,
    trades: (payload.trades as unknown[]).length,
    tradePlans: (payload.tradePlans as unknown[]).length,
    tradeExecutions: (payload.tradeExecutions as unknown[]).length,
    tradeFees: (payload.tradeFees as unknown[]).length,
  };
  const total = Object.values(expected).reduce((sum, count) => sum + count, 0);
  for (const [key, count] of Object.entries(expected)) {
    if (input.recordCounts[key] !== count) {
      throw new KairosBackupValidationError('INVALID_RECORD_COUNTS', `Backup ${key} count does not match the payload.`);
    }
  }
  if (input.recordCounts.total !== total) {
    throw new KairosBackupValidationError('INVALID_RECORD_COUNTS', 'Backup total count does not match the payload.');
  }
  return input as unknown as KairosBackupEnvelopeV2;
}

export function validateKairosBackupEnvelope(input: unknown): KairosBackupEnvelope {
  if (!isRecord(input)) {
    throw new KairosBackupValidationError('INVALID_ROOT', 'Backup root must be an object.');
  }
  if (input.formatName !== KAIROS_BACKUP_FORMAT_NAME) {
    throw new KairosBackupValidationError('FORMAT_NAME_MISMATCH', 'Backup format name is not Kairos.');
  }
  if (input.formatVersion !== KAIROS_LEGACY_BACKUP_FORMAT_VERSION && input.formatVersion !== KAIROS_BACKUP_FORMAT_VERSION) {
    throw new KairosBackupValidationError('UNSUPPORTED_FORMAT_VERSION', 'Backup format version is not supported by this build.');
  }
  validateCommonHeader(input);
  return input.formatVersion === KAIROS_LEGACY_BACKUP_FORMAT_VERSION ? validateV1(input) : validateV2(input);
}
