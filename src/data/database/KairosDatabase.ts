import Dexie, { type EntityTable } from 'dexie';
import { registerKairosMigrations } from './migrations';
import {
  KAIROS_DATABASE_NAME,
  type DatabaseMetadataRecord,
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

  constructor(name = KAIROS_DATABASE_NAME) {
    super(name);
    registerKairosMigrations(this);
  }
}
