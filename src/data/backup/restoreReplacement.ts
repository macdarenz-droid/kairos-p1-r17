import type { KairosDatabase } from '../database/KairosDatabase';
import { assertKairosDatabaseIntegrity, type DatabaseIntegrityReport } from '../database/integrity';
import { runKairosAtomicWrite } from '../database/transactions';
import type { KairosPreparedRestoreV2 } from './restorePreflight';

export interface KairosRestoreResultV2 {
  readonly restoredMetadataRecords: number;
  readonly restoredTradeRecords: number;
  readonly restoredTradePlanRecords: number;
  readonly restoredTradeExecutionRecords: number;
  readonly restoredTradeFeeRecords: number;
  readonly integrity: DatabaseIntegrityReport;
}

export async function replaceKairosDatabaseFromPreparedRestore(
  db: KairosDatabase,
  prepared: KairosPreparedRestoreV2,
): Promise<KairosRestoreResultV2> {
  const incoming = prepared.incoming.payload;
  const metadata = incoming.metadata.map((record) => ({ ...record }));
  const trades = incoming.trades.map((record) => ({ ...record }));
  const tradePlans = incoming.tradePlans.map((record) => ({ ...record }));
  const tradeExecutions = incoming.tradeExecutions.map((record) => ({ ...record }));
  const tradeFees = incoming.tradeFees.map((record) => ({ ...record }));

  await runKairosAtomicWrite(
    db,
    ['metadata', 'trades', 'tradePlans', 'tradeExecutions', 'tradeFees'],
    async ({ repositories }) => {
      // Parent first on write; all stores are still covered by one atomic transaction.
      await repositories.metadata.replaceAll(metadata);
      await repositories.trades.replaceAll(trades);
      await repositories.tradePlans.replaceAll(tradePlans);
      await repositories.tradeExecutions.replaceAll(tradeExecutions);
      await repositories.tradeFees.replaceAll(tradeFees);
    },
  );

  const integrity = await assertKairosDatabaseIntegrity(db);
  return Object.freeze({
    restoredMetadataRecords: metadata.length,
    restoredTradeRecords: trades.length,
    restoredTradePlanRecords: tradePlans.length,
    restoredTradeExecutionRecords: tradeExecutions.length,
    restoredTradeFeeRecords: tradeFees.length,
    integrity,
  });
}
