import type { TradeExecutionRecord, TradeFeeRecord, TradePlanRecord, TradeRecord } from '../../domain/trades';

export const KAIROS_DATABASE_NAME = 'kairos';
export const KAIROS_DB_SCHEMA_VERSION = 2 as const;

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

export interface DatabaseMetadataRecord {
  readonly key: string;
  readonly value: string;
  readonly updatedAt: string;
}

export type DatabaseTradeRecord = TradeRecord;
export type DatabaseTradePlanRecord = TradePlanRecord;
export type DatabaseTradeExecutionRecord = TradeExecutionRecord;
export type DatabaseTradeFeeRecord = TradeFeeRecord;
