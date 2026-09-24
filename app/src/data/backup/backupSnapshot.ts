import type { KairosDatabase } from '../database/KairosDatabase';
import { KAIROS_DB_SCHEMA_VERSION } from '../database/schema';
import { assertKairosDatabaseIntegrity } from '../database/integrity';
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

export async function createKairosDatabaseSnapshot(
  db: KairosDatabase,
  options: CreateKairosDatabaseSnapshotOptions = {},
): Promise<KairosBackupEnvelopeV5> {
  await assertKairosDatabaseIntegrity(db);
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
      return {
        metadata: sortByKey(metadata.filter((record) => !isKairosDeviceScopedMetadataKey(record.key))),
        trades: sortById(trades),
        tradePlans: sortById(tradePlans),
        tradeExecutions: sortById(tradeExecutions),
        tradeFees: sortById(tradeFees),
        savedAnalyses: sortById(savedAnalyses),
        savedTimeAssistedSnapshots: sortById(savedTimeAssistedSnapshots),
        tradeDiscipline: sortById(tradeDiscipline),
      };
    },
  );

  return createKairosBackupEnvelope({
    ...snapshot,
    exportedAt: options.exportedAt,
    appVersion: options.appVersion,
    buildId: options.buildId,
    databaseSchemaVersion: KAIROS_DB_SCHEMA_VERSION,
  });
}
