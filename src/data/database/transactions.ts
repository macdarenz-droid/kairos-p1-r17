import type { Transaction } from 'dexie';
import { createKairosRepositories, type KairosRepositories } from '../repositories';
import type { KairosDatabase } from './KairosDatabase';
import { KAIROS_V2_STORES } from './schema';

export type KairosTransactionStoreName = keyof typeof KAIROS_V2_STORES;

export interface KairosTransactionContext {
  readonly transaction: Transaction;
  readonly repositories: KairosRepositories;
}

export type KairosAtomicWriteWork<T> = (
  context: KairosTransactionContext,
) => T | PromiseLike<T>;

function normalizeTransactionStores(
  storeNames: readonly KairosTransactionStoreName[],
): readonly KairosTransactionStoreName[] {
  if (storeNames.length === 0) {
    throw new Error('Kairos atomic write requires at least one declared store.');
  }

  const uniqueStoreNames = [...new Set(storeNames)];
  for (const storeName of uniqueStoreNames) {
    if (!Object.hasOwn(KAIROS_V2_STORES, storeName)) {
      throw new Error(`Kairos atomic write received undeclared store: ${String(storeName)}.`);
    }
  }

  return uniqueStoreNames;
}

/**
 * Runs one short atomic persistence unit.
 *
 * Validation, calculations, network requests and user waits belong before this
 * function is entered. Only IndexedDB/Dexie-backed repository work should be
 * awaited inside the callback so the transaction cannot auto-commit early.
 */
export async function runKairosAtomicWrite<T>(
  db: KairosDatabase,
  storeNames: readonly KairosTransactionStoreName[],
  work: KairosAtomicWriteWork<T>,
): Promise<T> {
  const normalizedStoreNames = normalizeTransactionStores(storeNames);
  const tables = normalizedStoreNames.map((storeName) => db.table(storeName));
  const repositories = createKairosRepositories(db);

  return db.transaction('rw', tables, (transaction) =>
    work(Object.freeze({ transaction, repositories })),
  );
}
