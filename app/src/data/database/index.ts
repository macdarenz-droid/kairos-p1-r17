export {
  assertKairosCoreIntegrity,
  assertKairosDatabaseIntegrity,
  DatabaseIntegrityError,
  inspectKairosDatabaseIntegrity,
  isSavedAnalysisRecordShape,
  isSavedTimeAssistedSnapshotRecordShape,
  KAIROS_CORE_INTEGRITY_CHECKS,
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
  KAIROS_V3_STORES,
  KAIROS_V4_STORES,
  KAIROS_V5_STORES,
  KAIROS_V6_STORES,
  KAIROS_V7_STORES,
  KAIROS_V8_STORES,
  KAIROS_V9_STORES,
  KAIROS_V10_STORES,
  KAIROS_V11_STORES,
  KAIROS_V12_STORES,
  KAIROS_V13_STORES,
  KAIROS_V14_STORES,
  KAIROS_CURRENT_STORES,
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
export type { DatabaseDeviceHandleRecord, DatabaseEconomicEventRecord, DatabaseExchangeRateRecord, DatabaseMetadataRecord, DatabaseSavedAnalysisRecord, DatabaseSavedTimeAssistedSnapshotRecord, DatabaseTradeDisciplineRecord } from './schema';

export type { DatabaseIntegrityCheck, DatabaseIntegrityCheckId, DatabaseIntegrityCheckTier, DatabaseIntegrityReport } from './integrity';
export {
  KAIROS_JOURNAL_CHANNEL,
  classifyKairosWriteFailure,
  listenForKairosJournalChanges,
  runKairosAtomicWrite,
  subscribeKairosWriteFailures,
} from './transactions';
export type {
  KairosAtomicWriteWork,
  KairosTransactionContext,
  KairosTransactionStoreName,
  KairosWriteFailureKind,
  KairosWriteFailureListener,
} from './transactions';
