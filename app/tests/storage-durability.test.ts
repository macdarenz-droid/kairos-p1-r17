import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getStorageDurabilityStatus,
  inspectStorageDurability,
  requestPersistentStorage,
  subscribeStorageDurabilityStatus,
} from '../src/pwa/storageDurability';

const originalStorageDescriptor = Object.getOwnPropertyDescriptor(navigator, 'storage');

function setStorage(value: Partial<StorageManager> | undefined) {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value,
  });
}

afterEach(() => {
  if (originalStorageDescriptor) Object.defineProperty(navigator, 'storage', originalStorageDescriptor);
  else Reflect.deleteProperty(navigator, 'storage');
  vi.restoreAllMocks();
});

describe('P4.3 storage durability owner', () => {
  it('reports unsupported without fabricating persistence', async () => {
    setStorage(undefined);
    await expect(inspectStorageDurability()).resolves.toEqual({ state: 'unsupported', persistent: false });
  });

  it('reports best-effort when persistence has not been granted', async () => {
    setStorage({ persisted: vi.fn().mockResolvedValue(false) });
    await expect(inspectStorageDurability()).resolves.toEqual({ state: 'best-effort', persistent: false });
  });

  it('reports persistent when the browser confirms durable storage', async () => {
    setStorage({ persisted: vi.fn().mockResolvedValue(true) });
    await expect(inspectStorageDurability()).resolves.toEqual({ state: 'persistent', persistent: true });
  });

  it('requests persistence only through the explicit request command', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    setStorage({ persist, persisted: vi.fn().mockResolvedValue(false) });
    await inspectStorageDurability();
    expect(persist).not.toHaveBeenCalled();
    await expect(requestPersistentStorage()).resolves.toEqual({ state: 'persistent', persistent: true });
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('publishes status changes for future UI consumers', async () => {
    setStorage({ persisted: vi.fn().mockResolvedValue(true) });
    const seen: string[] = [];
    const unsubscribe = subscribeStorageDurabilityStatus((status) => seen.push(status.state));
    await inspectStorageDurability();
    unsubscribe();
    expect(seen.at(-1)).toBe('persistent');
    expect(getStorageDurabilityStatus()).toEqual({ state: 'persistent', persistent: true });
  });

  it('surfaces API failures as an internal status instead of throwing at bootstrap', async () => {
    setStorage({ persisted: vi.fn().mockRejectedValue(new Error('blocked')) });
    await expect(inspectStorageDurability()).resolves.toEqual({ state: 'error', persistent: false });
  });
});
