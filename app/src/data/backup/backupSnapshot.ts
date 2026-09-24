import type { KairosDatabase } from '../database/KairosDatabase';
import { KAIROS_DB_SCHEMA_VERSION } from '../database/schema';
import { assertKairosCoreIntegrity, isSavedAnalysisRecordShape, isSavedTimeAssistedSnapshotRecordShape } from '../database/integrity';
import { isTradeDisciplineRecordShape } from '../../domain/discipline';
import {
  createKairosRepositories,
  isKairosDeviceScopedMetadataKey,
  type KairosRepositories,
} from '../repositories';
import { createKairosBackupEnvelope } from './backupEnvelope';
import type { KairosBackupEnvelopeV5 } from './backupFormat';

export interface CreateKairosDatabaseSnapshotOptions {
  readonly exportedAt?: Date;
  readonly appVersion?: string;
  readonly buildId?: string;
}

function sortByKey<T extends { readonly key: string }>(records: readonly T[]): T[] {
  return [...records].sort((left, right) => left.key.localeCompare(right.key));
}
function sortById<T extends { readonly id: string }>(records: readonly T[]): T[] {
  return [...records].sort((left, right) => left.id.localeCompare(right.id));
}

/** How many damaged extra records an export left out; they stay on the device. */
export interface KairosSnapshotSkippedCounts {
  readonly savedAnalyses: number;
  readonly savedTimeAssistedSnapshots: number;
  readonly tradeDiscipline: number;
}

export interface KairosDatabaseSnapshotReport {
  readonly envelope: KairosBackupEnvelopeV5;
  readonly skipped: KairosSnapshotSkippedCounts;
}

/**
 * Backup snapshot that is never locked by damaged extra data (D8). Journal
 * truth must pass every core integrity check; damaged Saved Analyses,
 * snapshots and discipline records are left out of the backup and counted.
 * A discipline record is kept only when its trade exists, and only the first
 * one per trade (by id). Nothing is deleted from the database.
 */
export async function createKairosDatabaseSnapshotWithReport(
  db: KairosDatabase,
  options: CreateKairosDatabaseSnapshotOptions = {},
): Promise<KairosDatabaseSnapshotReport> {
  await assertKairosCoreIntegrity(db);
  const repositories: KairosRepositories = createKairosRepositories(db);

  const snapshot = await db.transaction(
    'r',
    [db.metadata, db.trades, db.tradePlans, db.tradeExecutions, db.tradeFees, db.savedAnalyses, db.savedTimeAssistedSnapshots, db.tradeDiscipline],
    async () => {
      const [metadata, trades, tradePlans, tradeExecutions, tradeFees, savedAnalyses, savedTimeAssistedSnapshots, tradeDiscipline] = await Promise.all([
        repositories.metadata.listAll(),
        repositories.trades.listAll(),
        db.tradePlans.toArray(),
        db.tradeExecutions.toArray(),
        db.tradeFees.toArray(),
        repositories.savedAnalyses.listAll(),
        repositories.savedTimeAssistedSnapshots.listAll(),
        repositories.tradeDiscipline.listAll(),
      ]);
      const tradeIds = new Set(trades.map((trade) => trade.id));
      const keptAnalyses = savedAnalyses.filter(isSavedAnalysisRecordShape);
      const keptSnapshots = savedTimeAssistedSnapshots.filter(isSavedTimeAssistedSnapshotRecordShape);
      const disciplinedTrades = new Set<string>();
      const keptDiscipline = sortById(tradeDiscipline.filter((record) => isTradeDisciplineRecordShape(record) && tradeIds.has(record.tradeId)))
        .filter((record) => {
          if (disciplinedTrades.has(record.tradeId)) return false;
          disciplinedTrades.add(record.tradeId);
          return true;
        });
      return {
        payload: {
          metadata: sortByKey(metadata.filter((record) => !isKairosDeviceScopedMetadataKey(record.key))),
          trades: sortById(trades),
          tradePlans: sortById(tradePlans),
          tradeExecutions: sortById(tradeExecutions),
          tradeFees: sortById(tradeFees),
          savedAnalyses: sortById(keptAnalyses),
          savedTimeAssistedSnapshots: sortById(keptSnapshots),
          tradeDiscipline: keptDiscipline,
        },
        skipped: Object.freeze({
          savedAnalyses: savedAnalyses.length - keptAnalyses.length,
          savedTimeAssistedSnapshots: savedTimeAssistedSnapshots.length - keptSnapshots.length,
          tradeDiscipline: tradeDiscipline.length - keptDiscipline.length,
        }),
      };
    },
  );

  const envelope = createKairosBackupEnvelope({
    ...snapshot.payload,
    exportedAt: options.exportedAt,
    appVersion: options.appVersion,
    buildId: options.buildId,
    databaseSchemaVersion: KAIROS_DB_SCHEMA_VERSION,
  });
  return Object.freeze({ envelope, skipped: snapshot.skipped });
}

export async function createKairosDatabaseSnapshot(
  db: KairosDatabase,
  options: CreateKairosDatabaseSnapshotOptions = {},
): Promise<KairosBackupEnvelopeV5> {
  return (await createKairosDatabaseSnapshotWithReport(db, options)).envelope;
}
