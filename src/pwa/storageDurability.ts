export type StorageDurabilityState =
  | 'unknown'
  | 'unsupported'
  | 'best-effort'
  | 'persistent'
  | 'error';

export interface StorageDurabilityStatus {
  readonly state: StorageDurabilityState;
  readonly persistent: boolean;
}

type StorageDurabilityListener = (status: StorageDurabilityStatus) => void;

const listeners = new Set<StorageDurabilityListener>();
let currentStatus: StorageDurabilityStatus = { state: 'unknown', persistent: false };

function publish(status: StorageDurabilityStatus) {
  currentStatus = status;
  for (const listener of listeners) listener(status);
}

function getStorageManager(): StorageManager | null {
  if (typeof navigator === 'undefined' || !('storage' in navigator)) return null;
  return navigator.storage ?? null;
}

export function getStorageDurabilityStatus(): StorageDurabilityStatus {
  return currentStatus;
}

export function subscribeStorageDurabilityStatus(listener: StorageDurabilityListener): () => void {
  listeners.add(listener);
  listener(currentStatus);
  return () => listeners.delete(listener);
}

export async function inspectStorageDurability(): Promise<StorageDurabilityStatus> {
  const storage = getStorageManager();
  if (!storage || typeof storage.persisted !== 'function') {
    const status = { state: 'unsupported', persistent: false } as const;
    publish(status);
    return status;
  }

  try {
    const persistent = await storage.persisted();
    const status: StorageDurabilityStatus = persistent
      ? { state: 'persistent', persistent: true }
      : { state: 'best-effort', persistent: false };
    publish(status);
    return status;
  } catch {
    const status = { state: 'error', persistent: false } as const;
    publish(status);
    return status;
  }
}

export async function requestPersistentStorage(): Promise<StorageDurabilityStatus> {
  const storage = getStorageManager();
  if (!storage || typeof storage.persist !== 'function') {
    return inspectStorageDurability();
  }

  try {
    const persistent = await storage.persist();
    const status: StorageDurabilityStatus = persistent
      ? { state: 'persistent', persistent: true }
      : { state: 'best-effort', persistent: false };
    publish(status);
    return status;
  } catch {
    const status = { state: 'error', persistent: false } as const;
    publish(status);
    return status;
  }
}
