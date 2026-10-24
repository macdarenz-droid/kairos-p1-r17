import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getStorageDurabilityStatus,
  inspectStorageDurability,
  requestPersistentStorage,
  subscribeStorageDurabilityStatus,
  describeStorageUse,
  estimateStorageUse,
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

describe('T-054d how much Kairos keeps on this device', () => {
  it('reads the browser\'s estimate, and nothing it cannot trust', async () => {
    setStorage({ estimate: vi.fn().mockResolvedValue({ usage: 12_400_000, quota: 2_112_400_000 }) });
    await expect(estimateStorageUse()).resolves.toEqual({ usage: 12_400_000, quota: 2_112_400_000 });
    setStorage({ estimate: vi.fn().mockResolvedValue({ usage: 5 }) });
    await expect(estimateStorageUse()).resolves.toBeNull();
    setStorage({ estimate: vi.fn().mockRejectedValue(new Error('denied')) });
    await expect(estimateStorageUse()).resolves.toBeNull();
    setStorage(undefined);
    await expect(estimateStorageUse()).resolves.toBeNull();
  });

  it('says it in plain sizes', () => {
    expect(describeStorageUse({ usage: 12_400_000, quota: 2_112_400_000 })).toBe('Kairos uses about 12 MB · 2.1 GB free');
    expect(describeStorageUse({ usage: 640_000, quota: 300_640_000 })).toBe('Kairos uses less than 1 MB · 300 MB free');
    expect(describeStorageUse({ usage: 2_450_000, quota: 52_450_000_000 })).toBe('Kairos uses about 2.5 MB · 52 GB free');
  });
});
