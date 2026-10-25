import Dexie, { type EntityTable } from 'dexie';
import { tradeJournalAt } from '../../domain/trades';
import { registerKairosMigrations } from './migrations';
import {
  KAIROS_DATABASE_NAME,
  type DatabaseDeviceHandleRecord,
  type DatabaseEconomicEventRecord,
  type DatabaseExchangeRateRecord,
  type DatabaseMetadataRecord,
  type DatabaseSavedAnalysisRecord,
  type DatabaseSavedTimeAssistedSnapshotRecord,
  type DatabaseTradeDisciplineRecord,
  type DatabaseTradeExecutionRecord,
  type DatabaseTradeFeeRecord,
  type DatabaseTradePlanRecord,
  type DatabaseTradeRecord,
} from './schema';

export class KairosDatabase extends Dexie {
  readonly metadata!: EntityTable<DatabaseMetadataRecord, 'key'>;
  readonly trades!: EntityTable<DatabaseTradeRecord, 'id'>;
  readonly tradePlans!: EntityTable<DatabaseTradePlanRecord, 'id'>;
  readonly tradeExecutions!: EntityTable<DatabaseTradeExecutionRecord, 'id'>;
  readonly tradeFees!: EntityTable<DatabaseTradeFeeRecord, 'id'>;
  readonly savedAnalyses!: EntityTable<DatabaseSavedAnalysisRecord, 'id'>;
  readonly savedTimeAssistedSnapshots!: EntityTable<DatabaseSavedTimeAssistedSnapshotRecord, 'id'>;
  readonly tradeDiscipline!: EntityTable<DatabaseTradeDisciplineRecord, 'id'>;
  readonly exchangeRates!: EntityTable<DatabaseExchangeRateRecord, 'id'>;
  readonly economicEvents!: EntityTable<DatabaseEconomicEventRecord, 'id'>;
  readonly deviceHandles!: EntityTable<DatabaseDeviceHandleRecord, 'key'>;

  constructor(name = KAIROS_DATABASE_NAME) {
    super(name);
    registerKairosMigrations(this);
    // U15 (D259): every write of a trade stamps the Journal's order, whichever command, import, restore or test wrote it.
    // Stored records are often frozen, so each one is copied with the stamp rather than changed in place.
    this.use({
      stack: 'dbcore',
      name: 'kairos-journal-order',
      create: down => ({
        ...down,
        table: tableName => {
          const table = down.table(tableName);
          if (tableName !== 'trades') return table;
          return {
            ...table,
            mutate: request => (request.type === 'add' || request.type === 'put'
              ? table.mutate({ ...request, values: request.values.map((trade: DatabaseTradeRecord) => ({ ...trade, journalAt: tradeJournalAt(trade) })) })
              : table.mutate(request)),
          };
        },
      }),
    });
  }
}
