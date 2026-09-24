import type { SavedAnalysis } from '../../domain/saved-records/savedAnalysisContract';
import type { SavedTimeAssistedSnapshot } from '../../domain/saved-records/savedTimeAssistedSnapshotContract';
import type { LegacyTradeDisciplineRecord, TradeDisciplineRecord } from '../../domain/discipline';
import type { DatabaseMetadataRecord, DatabaseTradeExecutionRecord, DatabaseTradeFeeRecord, DatabaseTradePlanRecord, DatabaseTradeRecord } from '../database/schema';

export const KAIROS_BACKUP_FORMAT_NAME = 'kairos-full-backup' as const;
export const KAIROS_BACKUP_FORMAT_VERSION = 7 as const;
export const KAIROS_CHART_ZONE_BACKUP_FORMAT_VERSION = 6 as const;
export const KAIROS_TRADE_DISCIPLINE_BACKUP_FORMAT_VERSION = 5 as const;
export const KAIROS_SAVED_TIME_ASSISTED_SNAPSHOT_BACKUP_FORMAT_VERSION = 4 as const;
export const KAIROS_SAVED_ANALYSIS_BACKUP_FORMAT_VERSION = 3 as const;
export const KAIROS_LEGACY_BACKUP_FORMAT_VERSION = 1 as const;
export const KAIROS_TRADE_BACKUP_FORMAT_VERSION = 2 as const;

export interface KairosBackupPayloadV1 { readonly metadata: readonly DatabaseMetadataRecord[]; }
export interface KairosBackupRecordCountsV1 { readonly metadata:number; readonly total:number; }
export interface KairosBackupEnvelopeV1 { readonly formatName:typeof KAIROS_BACKUP_FORMAT_NAME; readonly formatVersion:1; readonly appVersion:string; readonly buildId:string; readonly exportedAt:string; readonly databaseSchemaVersion:1; readonly recordCounts:KairosBackupRecordCountsV1; readonly payload:KairosBackupPayloadV1; }

export interface KairosBackupPayloadV2 { readonly metadata:readonly DatabaseMetadataRecord[]; readonly trades:readonly DatabaseTradeRecord[]; readonly tradePlans:readonly DatabaseTradePlanRecord[]; readonly tradeExecutions:readonly DatabaseTradeExecutionRecord[]; readonly tradeFees:readonly DatabaseTradeFeeRecord[]; }
export interface KairosBackupRecordCountsV2 { readonly metadata:number; readonly trades:number; readonly tradePlans:number; readonly tradeExecutions:number; readonly tradeFees:number; readonly total:number; }
export interface KairosBackupEnvelopeV2 { readonly formatName:typeof KAIROS_BACKUP_FORMAT_NAME; readonly formatVersion:2; readonly appVersion:string; readonly buildId:string; readonly exportedAt:string; readonly databaseSchemaVersion:2|3; readonly recordCounts:KairosBackupRecordCountsV2; readonly payload:KairosBackupPayloadV2; }

export interface KairosBackupPayloadV3 extends KairosBackupPayloadV2 { readonly savedAnalyses: readonly SavedAnalysis[]; }
export interface KairosBackupRecordCountsV3 extends KairosBackupRecordCountsV2 { readonly savedAnalyses:number; }
export interface KairosBackupEnvelopeV3 { readonly formatName:typeof KAIROS_BACKUP_FORMAT_NAME; readonly formatVersion:3; readonly appVersion:string; readonly buildId:string; readonly exportedAt:string; readonly databaseSchemaVersion:4; readonly recordCounts:KairosBackupRecordCountsV3; readonly payload:KairosBackupPayloadV3; }

export interface KairosBackupPayloadV4 extends KairosBackupPayloadV3 { readonly savedTimeAssistedSnapshots: readonly SavedTimeAssistedSnapshot[]; }
export interface KairosBackupRecordCountsV4 extends KairosBackupRecordCountsV3 { readonly savedTimeAssistedSnapshots:number; }
export interface KairosBackupEnvelopeV4 { readonly formatName:typeof KAIROS_BACKUP_FORMAT_NAME; readonly formatVersion:4; readonly appVersion:string; readonly buildId:string; readonly exportedAt:string; readonly databaseSchemaVersion:5; readonly recordCounts:KairosBackupRecordCountsV4; readonly payload:KairosBackupPayloadV4; }

export interface KairosBackupPayloadV5 extends KairosBackupPayloadV4 { readonly tradeDiscipline: readonly LegacyTradeDisciplineRecord[]; }
export interface KairosBackupRecordCountsV5 extends KairosBackupRecordCountsV4 { readonly tradeDiscipline:number; }
export interface KairosBackupEnvelopeV5 { readonly formatName:typeof KAIROS_BACKUP_FORMAT_NAME; readonly formatVersion:5; readonly appVersion:string; readonly buildId:string; readonly exportedAt:string; readonly databaseSchemaVersion:6|7; readonly recordCounts:KairosBackupRecordCountsV5; readonly payload:KairosBackupPayloadV5; }

/** V6 keeps the V5 payload; saved analyses may now hold zone drawings. It describes schema 7. */
export interface KairosBackupEnvelopeV6 { readonly formatName:typeof KAIROS_BACKUP_FORMAT_NAME; readonly formatVersion:6; readonly appVersion:string; readonly buildId:string; readonly exportedAt:string; readonly databaseSchemaVersion:7; readonly recordCounts:KairosBackupRecordCountsV5; readonly payload:KairosBackupPayloadV5; }

/** V7 stores discipline answers by list item id with their label (D6). It describes schema 8. */
export interface KairosBackupPayloadV7 extends KairosBackupPayloadV4 { readonly tradeDiscipline: readonly TradeDisciplineRecord[]; }
export interface KairosBackupEnvelopeV7 { readonly formatName:typeof KAIROS_BACKUP_FORMAT_NAME; readonly formatVersion:7; readonly appVersion:string; readonly buildId:string; readonly exportedAt:string; readonly databaseSchemaVersion:8; readonly recordCounts:KairosBackupRecordCountsV5; readonly payload:KairosBackupPayloadV7; }

export type KairosBackupEnvelope = KairosBackupEnvelopeV1|KairosBackupEnvelopeV2|KairosBackupEnvelopeV3|KairosBackupEnvelopeV4|KairosBackupEnvelopeV5|KairosBackupEnvelopeV6|KairosBackupEnvelopeV7;
export type KairosCurrentBackupEnvelope = KairosBackupEnvelopeV7;
