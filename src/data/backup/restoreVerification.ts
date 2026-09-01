import { closeKairosDatabase, openKairosDatabase } from '../database/databaseLifecycle';
import type { KairosDatabase } from '../database/KairosDatabase';
import { assertKairosDatabaseIntegrity, type DatabaseIntegrityReport } from '../database/integrity';
import { createKairosRepositories, isKairosDeviceScopedMetadataKey } from '../repositories';
import type { KairosPreparedRestoreV2, KairosRecoverySnapshotV2 } from './restorePreflight';
import { replaceKairosDatabaseFromPreparedRestore } from './restoreReplacement';

export type KairosRestoreVerificationCode = 'REOPEN_FAILED' | 'REQUERY_MISMATCH';

export class KairosRestoreVerificationError extends Error {
  constructor(
    public readonly code: KairosRestoreVerificationCode,
    message: string,
    public readonly recovery: KairosRecoverySnapshotV2,
  ) {
    super(message);
    this.name = 'KairosRestoreVerificationError';
  }
}

export interface KairosVerifiedRestoreResultV2 {
  readonly restoredMetadataRecords: number;
  readonly restoredTradeRecords: number;
  /** Backward-compatible P6/P7 metadata re-query count. */
  readonly reloadedMetadataRecords: number;
  readonly reloadedTotalRecords: number;
  readonly verifiedAfterReload: true;
  readonly integrity: DatabaseIntegrityReport;
  readonly recovery: KairosRecoverySnapshotV2;
}

function normalizedJson<T extends object>(records: readonly T[], key: keyof T): string {
  return JSON.stringify([...records].map((record) => ({ ...record })).sort((a, b) => String(a[key]).localeCompare(String(b[key]))));
}

export async function restoreAndVerifyKairosDatabase(
  db: KairosDatabase,
  prepared: KairosPreparedRestoreV2,
): Promise<KairosVerifiedRestoreResultV2> {
  const replacement = await replaceKairosDatabaseFromPreparedRestore(db, prepared);

  closeKairosDatabase(db);
  const reopenStatus = await openKairosDatabase(db);
  if (reopenStatus.state !== 'ready') {
    throw new KairosRestoreVerificationError('REOPEN_FAILED', 'Restored data committed, but Kairos could not reopen the database for verification.', prepared.recovery);
  }

  const integrity = await assertKairosDatabaseIntegrity(db);
  const repositories = createKairosRepositories(db);
  const [metadata, trades, tradePlans, tradeExecutions, tradeFees] = await db.transaction(
    'r',
    [db.metadata, db.trades, db.tradePlans, db.tradeExecutions, db.tradeFees],
    async () => Promise.all([
      repositories.metadata.listAll(),
      repositories.trades.listAll(),
      repositories.tradePlans.listAll(),
      repositories.tradeExecutions.listAll(),
      repositories.tradeFees.listAll(),
    ]),
  );
  const backupMetadata = metadata.filter((record) => !isKairosDeviceScopedMetadataKey(record.key));
  const expected = prepared.incoming.payload;
  const matches =
    normalizedJson(backupMetadata, 'key') === normalizedJson(expected.metadata, 'key') &&
    normalizedJson(trades, 'id') === normalizedJson(expected.trades, 'id') &&
    normalizedJson(tradePlans, 'id') === normalizedJson(expected.tradePlans, 'id') &&
    normalizedJson(tradeExecutions, 'id') === normalizedJson(expected.tradeExecutions, 'id') &&
    normalizedJson(tradeFees, 'id') === normalizedJson(expected.tradeFees, 'id');

  if (!matches) {
    throw new KairosRestoreVerificationError('REQUERY_MISMATCH', 'Restored data did not match the prepared backup after reopening and re-querying.', prepared.recovery);
  }

  return Object.freeze({
    restoredMetadataRecords: replacement.restoredMetadataRecords,
    restoredTradeRecords: replacement.restoredTradeRecords,
    reloadedMetadataRecords: backupMetadata.length,
    reloadedTotalRecords: backupMetadata.length + trades.length + tradePlans.length + tradeExecutions.length + tradeFees.length,
    verifiedAfterReload: true as const,
    integrity,
    recovery: prepared.recovery,
  });
}
