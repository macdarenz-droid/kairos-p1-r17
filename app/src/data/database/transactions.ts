import type { Transaction } from 'dexie';
import { createKairosRepositories, type KairosRepositories } from '../repositories';
import type { KairosDatabase } from './KairosDatabase';
import { KAIROS_CURRENT_STORES } from './schema';

export type KairosTransactionStoreName = keyof typeof KAIROS_CURRENT_STORES;

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
    if (!Object.hasOwn(KAIROS_CURRENT_STORES, storeName)) {
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

  try {
    const result = await db.transaction('rw', tables, (transaction) =>
      work(Object.freeze({ transaction, repositories })),
    );
    reportWriteCommitted();
    return result;
  } catch (error) {
    reportWriteFailure(classifyKairosWriteFailure(error));
    throw error;
  }
}

/**
 * T-054d (D229): what a failed write was. Callers keep their own message (the write still throws); the shell hears the
 * kind once per failure: a full phone (`QuotaExceededError`, also as Dexie's `inner`), a closed database, or other.
 */
export type KairosWriteFailureKind = 'storage-full' | 'closed' | 'other';

/** Hears each failed write's kind, and null once a write commits after a failure (the failure is over). */
export type KairosWriteFailureListener = (kind: KairosWriteFailureKind | null) => void;

const failureListeners = new Set<KairosWriteFailureListener>();
let failing = false;

function errorNames(error: unknown): string[] {
  const names: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const { name, inner } = current as { readonly name?: unknown; readonly inner?: unknown };
    if (typeof name === 'string') names.push(name);
    current = inner;
  }
  return names;
}

export function classifyKairosWriteFailure(error: unknown): KairosWriteFailureKind {
  const names = errorNames(error);
  if (names.includes('QuotaExceededError')) return 'storage-full';
  if (names.includes('DatabaseClosedError')) return 'closed';
  return 'other';
}

export function subscribeKairosWriteFailures(listener: KairosWriteFailureListener): () => void {
  failureListeners.add(listener);
  return () => { failureListeners.delete(listener); };
}

function reportWriteFailure(kind: KairosWriteFailureKind): void {
  failing = true;
  for (const listener of failureListeners) listener(kind);
}

/**
 * T-054d (D229): other tabs hear each committed write as one `{ type: 'changed' }` on `BroadcastChannel('kairos-journal')`.
 * The channel is opened by the first listener (the shell); a tab never hears its own message, and without
 * BroadcastChannel nothing is posted.
 */
export const KAIROS_JOURNAL_CHANNEL = 'kairos-journal';

let journalChannel: BroadcastChannel | null = null;
const changeListeners = new Set<() => void>();

function reportWriteCommitted(): void {
  if (failing) {
    failing = false;
    for (const listener of failureListeners) listener(null);
  }
  try {
    journalChannel?.postMessage({ type: 'changed' });
  } catch {
    // A closed channel: the other tabs read again when you come back to them.
  }
}

/** Hears other tabs' committed writes. */
export function listenForKairosJournalChanges(listener: () => void): () => void {
  if (journalChannel === null && typeof BroadcastChannel === 'function') {
    journalChannel = new BroadcastChannel(KAIROS_JOURNAL_CHANNEL);
    // Node (the tests) keeps a process alive for an open channel; browsers have no `unref`.
    (journalChannel as { unref?: () => void }).unref?.();
    journalChannel.addEventListener('message', (event: MessageEvent<unknown>) => {
      const data = event.data as { readonly type?: unknown } | null;
      if (data?.type === 'changed') for (const heard of changeListeners) heard();
    });
  }
  changeListeners.add(listener);
  return () => { changeListeners.delete(listener); };
}
