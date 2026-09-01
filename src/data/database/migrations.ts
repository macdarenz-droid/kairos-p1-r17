import type Dexie from 'dexie';
import type { Transaction } from 'dexie';
import { KAIROS_DB_SCHEMA_VERSION, KAIROS_V1_STORES, KAIROS_V2_STORES } from './schema';

export type KairosStoreSchema = Readonly<Record<string, string | null>>;
export type KairosMigrationUpgrade = (transaction: Transaction) => void | PromiseLike<unknown>;
export interface KairosMigrationDefinition { readonly version: number; readonly stores: KairosStoreSchema; readonly upgrade?: KairosMigrationUpgrade; }

const KAIROS_V1_MIGRATION: KairosMigrationDefinition = Object.freeze({ version: 1, stores: KAIROS_V1_STORES });
const KAIROS_V2_MIGRATION: KairosMigrationDefinition = Object.freeze({ version: 2, stores: KAIROS_V2_STORES });

export const KAIROS_DATABASE_MIGRATIONS: readonly KairosMigrationDefinition[] = Object.freeze([KAIROS_V1_MIGRATION, KAIROS_V2_MIGRATION]);

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
