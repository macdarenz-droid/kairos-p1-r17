import { isStoredSavedRecordLabel } from '../../domain/saved-records/savedRecordLabel';
import { isTradeDisciplineRecordShape } from '../../domain/discipline';
import { parsePositiveDecimalString, validateTradeRecord } from '../../domain/trades';
import {
  KAIROS_BACKUP_FORMAT_NAME,
  KAIROS_BACKUP_FORMAT_VERSION,
  KAIROS_LEGACY_BACKUP_FORMAT_VERSION,
  KAIROS_SAVED_ANALYSIS_BACKUP_FORMAT_VERSION,
  KAIROS_SAVED_TIME_ASSISTED_SNAPSHOT_BACKUP_FORMAT_VERSION,
  KAIROS_TRADE_BACKUP_FORMAT_VERSION,
  type KairosBackupEnvelope,
  type KairosBackupEnvelopeV1,
  type KairosBackupEnvelopeV2,
  type KairosBackupEnvelopeV3,
  type KairosBackupEnvelopeV4,
  type KairosBackupEnvelopeV5,
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


function isSavedAnalysisRecord(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.id) && isRecord(value.market) && Array.isArray(value.drawings) && Array.isArray(value.riskRewards) && isStoredSavedRecordLabel(value.label);
}

function isEstimatedMarketReference(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === 'unavailable') return isRecord(value.instrument) && isNonEmptyString(value.requestedAt) && isNonEmptyString(value.reason);
  return value.kind === 'candle-range' && value.isEstimate === true && value.method === 'containing-candle' && value.resolution === '1m' && isRecord(value.instrument) && isNonEmptyString(value.requestedAt) && isIsoDate(value.requestedAtUtc) && isRecord(value.candle) && typeof value.gapMs === 'number' && isIsoDate(value.acquiredAt);
}

function isSavedTimeAssistedSnapshotRecord(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.id) && isRecord(value.market) && (value.side === 'long' || value.side === 'short') && isNonEmptyString(value.openedAt) && isIsoDate(value.openedAtUtc) && (value.closedAt === null || isNonEmptyString(value.closedAt)) && (value.closedAtUtc === null || isIsoDate(value.closedAtUtc)) && typeof value.inputTimeZone === 'string' && isEstimatedMarketReference(value.opening) && (value.closing === null || isEstimatedMarketReference(value.closing)) && (value.durationMs === null || typeof value.durationMs === 'number') && isIsoDate(value.savedAt) && value.isEstimate === true && value.source === 'market-reference' && isStoredSavedRecordLabel(value.label);
}

function isTradeDisciplineRecord(value: unknown): boolean {
  return isTradeDisciplineRecordShape(value);
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
  if (input.databaseSchemaVersion !== 2 && input.databaseSchemaVersion !== 3) {
    throw new KairosBackupValidationError('INVALID_HEADER', 'Backup format V2 must describe a supported database schema version.');
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


function validateV3(input: Record<string, unknown>): KairosBackupEnvelopeV3 {
  if (input.databaseSchemaVersion !== 4) throw new KairosBackupValidationError('INVALID_HEADER', 'Backup format V3 must describe database schema V4.');
  if (!isRecord(input.payload)) throw new KairosBackupValidationError('INVALID_PAYLOAD', 'Backup V3 payload is invalid.');
  const payload=input.payload;
  const validators:Array<[string,(value:unknown)=>boolean]>=[['metadata',isMetadataRecord],['trades',isTradeRecord],['tradePlans',isTradePlanRecord],['tradeExecutions',isTradeExecutionRecord],['tradeFees',isTradeFeeRecord],['savedAnalyses',isSavedAnalysisRecord]];
  for(const [key,validator] of validators){const records=payload[key];if(!Array.isArray(records)||!records.every(validator))throw new KairosBackupValidationError('INVALID_PAYLOAD',`Backup V3 ${key} payload is invalid.`);}
  if(!isRecord(input.recordCounts))throw new KairosBackupValidationError('INVALID_RECORD_COUNTS','Backup record counts are invalid.');
  const keys=['metadata','trades','tradePlans','tradeExecutions','tradeFees','savedAnalyses'] as const; let total=0;
  for(const key of keys){const count=(payload[key] as unknown[]).length; total+=count;if(input.recordCounts[key]!==count)throw new KairosBackupValidationError('INVALID_RECORD_COUNTS',`Backup ${key} count does not match the payload.`);}
  if(input.recordCounts.total!==total)throw new KairosBackupValidationError('INVALID_RECORD_COUNTS','Backup total count does not match the payload.');
  return input as unknown as KairosBackupEnvelopeV3;
}

function validateV4(input: Record<string, unknown>): KairosBackupEnvelopeV4 {
  if (input.databaseSchemaVersion !== 5) throw new KairosBackupValidationError('INVALID_HEADER', 'Backup format V4 must describe database schema V5.');
  if (!isRecord(input.payload)) throw new KairosBackupValidationError('INVALID_PAYLOAD', 'Backup V4 payload is invalid.');
  const payload=input.payload;
  const validators:Array<[string,(value:unknown)=>boolean]>=[['metadata',isMetadataRecord],['trades',isTradeRecord],['tradePlans',isTradePlanRecord],['tradeExecutions',isTradeExecutionRecord],['tradeFees',isTradeFeeRecord],['savedAnalyses',isSavedAnalysisRecord],['savedTimeAssistedSnapshots',isSavedTimeAssistedSnapshotRecord]];
  for(const [key,validator] of validators){const records=payload[key];if(!Array.isArray(records)||!records.every(validator))throw new KairosBackupValidationError('INVALID_PAYLOAD',`Backup V4 ${key} payload is invalid.`);}
  if(!isRecord(input.recordCounts))throw new KairosBackupValidationError('INVALID_RECORD_COUNTS','Backup record counts are invalid.');
  const keys=['metadata','trades','tradePlans','tradeExecutions','tradeFees','savedAnalyses','savedTimeAssistedSnapshots'] as const; let total=0;
  for(const key of keys){const count=(payload[key] as unknown[]).length; total+=count;if(input.recordCounts[key]!==count)throw new KairosBackupValidationError('INVALID_RECORD_COUNTS',`Backup ${key} count does not match the payload.`);}
  if(input.recordCounts.total!==total)throw new KairosBackupValidationError('INVALID_RECORD_COUNTS','Backup total count does not match the payload.');
  return input as unknown as KairosBackupEnvelopeV4;
}

function validateV5(input: Record<string, unknown>): KairosBackupEnvelopeV5 {
  if (input.databaseSchemaVersion !== 6) throw new KairosBackupValidationError('INVALID_HEADER', 'Backup format V5 must describe database schema V6.');
  if (!isRecord(input.payload)) throw new KairosBackupValidationError('INVALID_PAYLOAD', 'Backup V5 payload is invalid.');
  const payload=input.payload;
  const validators:Array<[string,(value:unknown)=>boolean]>=[['metadata',isMetadataRecord],['trades',isTradeRecord],['tradePlans',isTradePlanRecord],['tradeExecutions',isTradeExecutionRecord],['tradeFees',isTradeFeeRecord],['savedAnalyses',isSavedAnalysisRecord],['savedTimeAssistedSnapshots',isSavedTimeAssistedSnapshotRecord],['tradeDiscipline',isTradeDisciplineRecord]];
  for(const [key,validator] of validators){const records=payload[key];if(!Array.isArray(records)||!records.every(validator))throw new KairosBackupValidationError('INVALID_PAYLOAD',`Backup V5 ${key} payload is invalid.`);}
  if(!isRecord(input.recordCounts))throw new KairosBackupValidationError('INVALID_RECORD_COUNTS','Backup record counts are invalid.');
  const keys=['metadata','trades','tradePlans','tradeExecutions','tradeFees','savedAnalyses','savedTimeAssistedSnapshots','tradeDiscipline'] as const; let total=0;
  for(const key of keys){const count=(payload[key] as unknown[]).length; total+=count;if(input.recordCounts[key]!==count)throw new KairosBackupValidationError('INVALID_RECORD_COUNTS',`Backup ${key} count does not match the payload.`);}
  if(input.recordCounts.total!==total)throw new KairosBackupValidationError('INVALID_RECORD_COUNTS','Backup total count does not match the payload.');
  return input as unknown as KairosBackupEnvelopeV5;
}

export function validateKairosBackupEnvelope(input: unknown): KairosBackupEnvelope {
  if (!isRecord(input)) {
    throw new KairosBackupValidationError('INVALID_ROOT', 'Backup root must be an object.');
  }
  if (input.formatName !== KAIROS_BACKUP_FORMAT_NAME) {
    throw new KairosBackupValidationError('FORMAT_NAME_MISMATCH', 'Backup format name is not Kairos.');
  }
  if (input.formatVersion !== KAIROS_LEGACY_BACKUP_FORMAT_VERSION && input.formatVersion !== KAIROS_TRADE_BACKUP_FORMAT_VERSION && input.formatVersion !== KAIROS_SAVED_ANALYSIS_BACKUP_FORMAT_VERSION && input.formatVersion !== KAIROS_SAVED_TIME_ASSISTED_SNAPSHOT_BACKUP_FORMAT_VERSION && input.formatVersion !== KAIROS_BACKUP_FORMAT_VERSION) {
    throw new KairosBackupValidationError('UNSUPPORTED_FORMAT_VERSION', 'Backup format version is not supported by this build.');
  }
  validateCommonHeader(input);
  return input.formatVersion === KAIROS_LEGACY_BACKUP_FORMAT_VERSION ? validateV1(input) : input.formatVersion === KAIROS_TRADE_BACKUP_FORMAT_VERSION ? validateV2(input) : input.formatVersion === KAIROS_SAVED_ANALYSIS_BACKUP_FORMAT_VERSION ? validateV3(input) : input.formatVersion === KAIROS_SAVED_TIME_ASSISTED_SNAPSHOT_BACKUP_FORMAT_VERSION ? validateV4(input) : validateV5(input);
}
