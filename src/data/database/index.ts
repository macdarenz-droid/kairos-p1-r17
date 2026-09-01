export {
  assertKairosDatabaseIntegrity,
  DatabaseIntegrityError,
  inspectKairosDatabaseIntegrity,
} from './integrity';
export { KairosDatabase } from './KairosDatabase';
export {
  closeKairosDatabase,
  createKairosDatabase,
  getDatabaseLifecycleStatus,
  kairosDatabase,
  openKairosDatabase,
  subscribeDatabaseLifecycle,
} from './databaseLifecycle';
export {
  KAIROS_DATABASE_MIGRATIONS,
  registerKairosMigrations,
  validateKairosMigrationSequence,
} from './migrations';
export {
  KAIROS_DATABASE_NAME,
  KAIROS_DB_SCHEMA_VERSION,
  KAIROS_V1_STORES,
} from './schema';
export type {
  DatabaseLifecycleState,
  DatabaseLifecycleStatus,
} from './databaseLifecycle';
export type {
  KairosMigrationDefinition,
  KairosMigrationUpgrade,
  KairosStoreSchema,
} from './migrations';
export type { DatabaseMetadataRecord } from './schema';

export type { DatabaseIntegrityCheck, DatabaseIntegrityCheckId, DatabaseIntegrityReport } from './integrity';
export { runKairosAtomicWrite } from './transactions';
export type {
  KairosAtomicWriteWork,
  KairosTransactionContext,
  KairosTransactionStoreName,
} from './transactions';
