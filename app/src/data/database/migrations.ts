import type Dexie from 'dexie';
import type { Transaction } from 'dexie';
import { KAIROS_DB_SCHEMA_VERSION, KAIROS_V1_STORES, KAIROS_V2_STORES, KAIROS_V3_STORES, KAIROS_V4_STORES, KAIROS_V5_STORES, KAIROS_V6_STORES, KAIROS_V7_STORES, KAIROS_V8_STORES, KAIROS_V9_STORES, KAIROS_V10_STORES, KAIROS_V11_STORES } from './schema';
import { isLegacyTradeDisciplineRecordShape, upgradeLegacyTradeDisciplineRecord } from '../../domain/discipline';

export type KairosStoreSchema = Readonly<Record<string, string | null>>;
export type KairosMigrationUpgrade = (transaction: Transaction) => void | PromiseLike<unknown>;
export interface KairosMigrationDefinition { readonly version: number; readonly stores: KairosStoreSchema; readonly upgrade?: KairosMigrationUpgrade; }

const KAIROS_V1_MIGRATION: KairosMigrationDefinition = Object.freeze({ version: 1, stores: KAIROS_V1_STORES });
const KAIROS_V2_MIGRATION: KairosMigrationDefinition = Object.freeze({ version: 2, stores: KAIROS_V2_STORES });
const KAIROS_V3_MIGRATION: KairosMigrationDefinition = Object.freeze({ version: 3, stores: KAIROS_V3_STORES });
const KAIROS_V4_MIGRATION: KairosMigrationDefinition = Object.freeze({ version: 4, stores: KAIROS_V4_STORES });
const KAIROS_V5_MIGRATION: KairosMigrationDefinition = Object.freeze({ version: 5, stores: KAIROS_V5_STORES });
const KAIROS_V6_MIGRATION: KairosMigrationDefinition = Object.freeze({ version: 6, stores: KAIROS_V6_STORES });
const KAIROS_V7_MIGRATION: KairosMigrationDefinition = Object.freeze({ version: 7, stores: KAIROS_V7_STORES });
/** V8 converts L36.1 discipline records to answers by item id with the default labels; a record in neither shape is left for integrity to report (D8). */
const KAIROS_V8_MIGRATION: KairosMigrationDefinition = Object.freeze({
  version: 8,
  stores: KAIROS_V8_STORES,
  upgrade: (transaction: Transaction) => transaction.table('tradeDiscipline').toCollection().modify((record, ref) => {
    if (isLegacyTradeDisciplineRecordShape(record)) ref.value = upgradeLegacyTradeDisciplineRecord(record);
  }),
});

/** V9 changes no store: a discipline record may carry an optional strategy mark (P28), so nothing is converted. */
const KAIROS_V9_MIGRATION: KairosMigrationDefinition = Object.freeze({ version: 9, stores: KAIROS_V9_STORES });

/** V10 appends the P33 exchange rate store; nothing to convert. */
const KAIROS_V10_MIGRATION: KairosMigrationDefinition = Object.freeze({ version: 10, stores: KAIROS_V10_STORES });

/** V11 appends the P34 news store; nothing to convert. */
const KAIROS_V11_MIGRATION: KairosMigrationDefinition = Object.freeze({ version: 11, stores: KAIROS_V11_STORES });

export const KAIROS_DATABASE_MIGRATIONS: readonly KairosMigrationDefinition[] = Object.freeze([KAIROS_V1_MIGRATION, KAIROS_V2_MIGRATION, KAIROS_V3_MIGRATION, KAIROS_V4_MIGRATION, KAIROS_V5_MIGRATION, KAIROS_V6_MIGRATION, KAIROS_V7_MIGRATION, KAIROS_V8_MIGRATION, KAIROS_V9_MIGRATION, KAIROS_V10_MIGRATION, KAIROS_V11_MIGRATION]);

export function validateKairosMigrationSequence(migrations: readonly KairosMigrationDefinition[], expectedCurrentVersion: number = KAIROS_DB_SCHEMA_VERSION): void {
  if (migrations.length === 0) throw new Error('Kairos database migration registry must contain schema version 1.');
  migrations.forEach((migration, index) => {
    const expectedVersion = index + 1;
    if (!Number.isInteger(migration.version) || migration.version !== expectedVersion) throw new Error(`Kairos database migrations must be contiguous and append-only. Expected v${expectedVersion}, received v${migration.version}.`);
  });
  const latestVersion = migrations[migrations.length - 1]?.version;
  if (latestVersion !== expectedCurrentVersion) throw new Error(`Kairos database migration registry ends at v${latestVersion ?? 'none'} but schema owner declares v${expectedCurrentVersion}.`);
}

export function registerKairosMigrations(db: Dexie, migrations: readonly KairosMigrationDefinition[] = KAIROS_DATABASE_MIGRATIONS, expectedCurrentVersion: number = KAIROS_DB_SCHEMA_VERSION): void {
  validateKairosMigrationSequence(migrations, expectedCurrentVersion);
  for (const migration of migrations) {
    const version = db.version(migration.version).stores(migration.stores);
    if (migration.upgrade) version.upgrade(migration.upgrade);
  }
}
