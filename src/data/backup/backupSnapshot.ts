import type { KairosDatabase } from '../database/KairosDatabase';
import { assertKairosDatabaseIntegrity } from '../database/integrity';
import {
  createKairosRepositories,
  isKairosDeviceScopedMetadataKey,
  type KairosRepositories,
} from '../repositories';
import { createKairosBackupEnvelope } from './backupEnvelope';
import type { KairosBackupEnvelopeV2 } from './backupFormat';

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
): Promise<KairosBackupEnvelopeV2> {
  await assertKairosDatabaseIntegrity(db);
  const repositories: KairosRepositories = createKairosRepositories(db);

  const snapshot = await db.transaction(
    'r',
    [db.metadata, db.trades, db.tradePlans, db.tradeExecutions, db.tradeFees],
    async () => {
      const [metadata, trades, tradePlans, tradeExecutions, tradeFees] = await Promise.all([
        repositories.metadata.listAll(),
        repositories.trades.listAll(),
        db.tradePlans.toArray(),
        db.tradeExecutions.toArray(),
        db.tradeFees.toArray(),
      ]);
      return {
        metadata: sortByKey(metadata.filter((record) => !isKairosDeviceScopedMetadataKey(record.key))),
        trades: sortById(trades),
        tradePlans: sortById(tradePlans),
        tradeExecutions: sortById(tradeExecutions),
        tradeFees: sortById(tradeFees),
      };
    },
  );

  return createKairosBackupEnvelope({
    ...snapshot,
    exportedAt: options.exportedAt,
    appVersion: options.appVersion,
    buildId: options.buildId,
    databaseSchemaVersion: 2,
  });
}
