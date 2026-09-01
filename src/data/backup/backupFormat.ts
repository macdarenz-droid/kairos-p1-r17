import type {
  DatabaseMetadataRecord,
  DatabaseTradeExecutionRecord,
  DatabaseTradeFeeRecord,
  DatabaseTradePlanRecord,
  DatabaseTradeRecord,
} from '../database/schema';

export const KAIROS_BACKUP_FORMAT_NAME = 'kairos-full-backup' as const;
export const KAIROS_BACKUP_FORMAT_VERSION = 2 as const;
export const KAIROS_LEGACY_BACKUP_FORMAT_VERSION = 1 as const;

export interface KairosBackupPayloadV1 {
  readonly metadata: readonly DatabaseMetadataRecord[];
}

export interface KairosBackupRecordCountsV1 {
  readonly metadata: number;
  readonly total: number;
}

export interface KairosBackupEnvelopeV1 {
  readonly formatName: typeof KAIROS_BACKUP_FORMAT_NAME;
  readonly formatVersion: typeof KAIROS_LEGACY_BACKUP_FORMAT_VERSION;
  readonly appVersion: string;
  readonly buildId: string;
  readonly exportedAt: string;
  readonly databaseSchemaVersion: 1;
  readonly recordCounts: KairosBackupRecordCountsV1;
  readonly payload: KairosBackupPayloadV1;
}

export interface KairosBackupPayloadV2 {
  readonly metadata: readonly DatabaseMetadataRecord[];
  readonly trades: readonly DatabaseTradeRecord[];
  readonly tradePlans: readonly DatabaseTradePlanRecord[];
  readonly tradeExecutions: readonly DatabaseTradeExecutionRecord[];
  readonly tradeFees: readonly DatabaseTradeFeeRecord[];
}

export interface KairosBackupRecordCountsV2 {
  readonly metadata: number;
  readonly trades: number;
  readonly tradePlans: number;
  readonly tradeExecutions: number;
  readonly tradeFees: number;
  readonly total: number;
}

export interface KairosBackupEnvelopeV2 {
  readonly formatName: typeof KAIROS_BACKUP_FORMAT_NAME;
  readonly formatVersion: typeof KAIROS_BACKUP_FORMAT_VERSION;
  readonly appVersion: string;
  readonly buildId: string;
  readonly exportedAt: string;
  readonly databaseSchemaVersion: 2;
  readonly recordCounts: KairosBackupRecordCountsV2;
  readonly payload: KairosBackupPayloadV2;
}

export type KairosBackupEnvelope = KairosBackupEnvelopeV1 | KairosBackupEnvelopeV2;
export type KairosCurrentBackupEnvelope = KairosBackupEnvelopeV2;
