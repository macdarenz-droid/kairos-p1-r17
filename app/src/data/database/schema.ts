import type { SavedAnalysis } from '../../domain/saved-records/savedAnalysisContract';
import type { SavedTimeAssistedSnapshot } from '../../domain/saved-records/savedTimeAssistedSnapshotContract';
import type { TradeDisciplineRecord } from '../../domain/discipline';
import type { TradeExecutionRecord, TradeFeeRecord, TradePlanRecord, TradeRecord } from '../../domain/trades';

export const KAIROS_DATABASE_NAME = 'kairos';
export const KAIROS_DB_SCHEMA_VERSION = 8 as const;

/** Immutable released V1 contract. Never edit. */
export const KAIROS_V1_STORES = Object.freeze({
  metadata: '&key',
});

/** V2 appends the first roadmap-owned trade persistence stores. */
export const KAIROS_V2_STORES = Object.freeze({
  metadata: '&key',
  trades: '&id,status,symbol,updatedAt',
  tradePlans: '&id,tradeId,updatedAt',
  tradeExecutions: '&id,tradeId,type,executedAt',
  tradeFees: '&id,tradeId,executionId',
});


/** V3 adds an indexed newest-first status history access path without changing stored trade records. */
export const KAIROS_V3_STORES = Object.freeze({
  trades: '&id,status,symbol,updatedAt,[status+updatedAt]',
});

/** V4 appends Saved Analysis persistence without rewriting released history. */
export const KAIROS_V4_STORES = Object.freeze({
  savedAnalyses: '&id',
});

/** V5 appends saved time-assisted snapshot persistence without rewriting released history. */
export const KAIROS_V5_STORES = Object.freeze({
  savedTimeAssistedSnapshots: '&id',
});

/** V6 appends the P36.1 trade discipline store (one record per trade) without rewriting released history. */
export const KAIROS_V6_STORES = Object.freeze({
  tradeDiscipline: '&id,tradeId,updatedAt',
});

/** V7 adds an indexed close-time path for period totals without changing stored trade records. */
export const KAIROS_V7_STORES = Object.freeze({
  trades: '&id,status,symbol,updatedAt,[status+updatedAt],[status+closedAt]',
});

/** V8 makes tradeId unique: the database keeps one discipline record per trade (D7). Records store answers by list item id with their label (D6). */
export const KAIROS_V8_STORES = Object.freeze({
  tradeDiscipline: '&id,&tradeId,updatedAt',
});

/** Current complete store authority used by transactions/integrity only. */
export const KAIROS_CURRENT_STORES = Object.freeze({
  ...KAIROS_V2_STORES,
  ...KAIROS_V3_STORES,
  ...KAIROS_V4_STORES,
  ...KAIROS_V5_STORES,
  ...KAIROS_V6_STORES,
  ...KAIROS_V7_STORES,
  ...KAIROS_V8_STORES,
});

export interface DatabaseMetadataRecord {
  readonly key: string;
  readonly value: string;
  readonly updatedAt: string;
}

export type DatabaseTradeRecord = TradeRecord;
export type DatabaseTradePlanRecord = TradePlanRecord;
export type DatabaseTradeExecutionRecord = TradeExecutionRecord;
export type DatabaseTradeFeeRecord = TradeFeeRecord;

export type DatabaseSavedAnalysisRecord = SavedAnalysis;
export type DatabaseSavedTimeAssistedSnapshotRecord = SavedTimeAssistedSnapshot;
export type DatabaseTradeDisciplineRecord = TradeDisciplineRecord;
