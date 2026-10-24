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

/** T-054d: what Kairos keeps on this device and how much more the browser lets it keep, in bytes. */
export interface StorageUse {
  readonly usage: number;
  readonly quota: number;
}

/** The browser's estimate (`navigator.storage.estimate()`), when it offers one; null otherwise. Never asks for anything. */
export async function estimateStorageUse(): Promise<StorageUse | null> {
  const storage = getStorageManager();
  if (!storage || typeof storage.estimate !== 'function') return null;
  try {
    const { usage, quota } = await storage.estimate();
    if (typeof usage !== 'number' || typeof quota !== 'number' || !Number.isFinite(usage) || !Number.isFinite(quota) || usage < 0 || quota < usage) return null;
    return { usage, quota };
  } catch {
    return null;
  }
}

/** A size in the decimal units phones show storage in: "640 KB" is "less than 1 MB", then MB, then GB. */
function describeBytes(bytes: number): string {
  const megabytes = bytes / 1e6;
  if (Math.round(megabytes) < 1000) return megabytes < 10 ? `${megabytes.toFixed(1)} MB` : `${Math.round(megabytes)} MB`;
  const gigabytes = bytes / 1e9;
  return gigabytes < 10 ? `${gigabytes.toFixed(1)} GB` : `${Math.round(gigabytes)} GB`;
}

/** "Kairos uses about 12 MB · 2.1 GB free": the browser's estimate is rounded, so the words say "about". */
export function describeStorageUse(use: StorageUse): string {
  const used = use.usage < 1e6 ? 'Kairos uses less than 1 MB' : `Kairos uses about ${describeBytes(use.usage)}`;
  return `${used} · ${describeBytes(use.quota - use.usage)} free`;
}
