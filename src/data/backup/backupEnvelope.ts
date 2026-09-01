import { APP_VERSION, BUILD_ID } from '../../app/buildInfo';
import {
  KAIROS_DB_SCHEMA_VERSION,
  type DatabaseMetadataRecord,
  type DatabaseTradeExecutionRecord,
  type DatabaseTradeFeeRecord,
  type DatabaseTradePlanRecord,
  type DatabaseTradeRecord,
} from '../database/schema';
import {
  KAIROS_BACKUP_FORMAT_NAME,
  KAIROS_BACKUP_FORMAT_VERSION,
  type KairosBackupEnvelopeV2,
  type KairosBackupPayloadV2,
} from './backupFormat';

export interface CreateKairosBackupEnvelopeOptions {
  readonly metadata: readonly DatabaseMetadataRecord[];
  readonly trades?: readonly DatabaseTradeRecord[];
  readonly tradePlans?: readonly DatabaseTradePlanRecord[];
  readonly tradeExecutions?: readonly DatabaseTradeExecutionRecord[];
  readonly tradeFees?: readonly DatabaseTradeFeeRecord[];
  readonly exportedAt?: Date;
  readonly appVersion?: string;
  readonly buildId?: string;
  readonly databaseSchemaVersion?: 2;
}

function cloneRecords<T extends object>(records: readonly T[]): T[] {
  return records.map((record) => ({ ...record }));
}

export function createKairosBackupEnvelope(
  options: CreateKairosBackupEnvelopeOptions,
): KairosBackupEnvelopeV2 {
  const payload: KairosBackupPayloadV2 = Object.freeze({
    metadata: Object.freeze(cloneRecords(options.metadata)),
    trades: Object.freeze(cloneRecords(options.trades ?? [])),
    tradePlans: Object.freeze(cloneRecords(options.tradePlans ?? [])),
    tradeExecutions: Object.freeze(cloneRecords(options.tradeExecutions ?? [])),
    tradeFees: Object.freeze(cloneRecords(options.tradeFees ?? [])),
  });

  const recordCounts = Object.freeze({
    metadata: payload.metadata.length,
    trades: payload.trades.length,
    tradePlans: payload.tradePlans.length,
    tradeExecutions: payload.tradeExecutions.length,
    tradeFees: payload.tradeFees.length,
    total:
      payload.metadata.length +
      payload.trades.length +
      payload.tradePlans.length +
      payload.tradeExecutions.length +
      payload.tradeFees.length,
  });

  return Object.freeze({
    formatName: KAIROS_BACKUP_FORMAT_NAME,
    formatVersion: KAIROS_BACKUP_FORMAT_VERSION,
    appVersion: options.appVersion ?? APP_VERSION,
    buildId: options.buildId ?? BUILD_ID,
    exportedAt: (options.exportedAt ?? new Date()).toISOString(),
    databaseSchemaVersion: options.databaseSchemaVersion ?? KAIROS_DB_SCHEMA_VERSION,
    recordCounts,
    payload,
  });
}
