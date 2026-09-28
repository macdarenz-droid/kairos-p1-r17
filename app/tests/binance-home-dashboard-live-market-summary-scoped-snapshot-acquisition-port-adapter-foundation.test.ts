import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBinanceHomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort,
  createLiveMarketSummaryStateSession,
  type MarketDataInstrument,
} from '../src/services/market-data';

const originalFetch = globalThis.fetch;
const btc: MarketDataInstrument = { venue: 'binance-spot', symbol: 'BTCUSDT' };
const observedAt = '2026-09-08T10:00:00.000Z';
const payload = JSON.stringify({
  symbol: 'BTCUSDT', openPrice: '62000', highPrice: '65000', lowPrice: '61000',
  lastPrice: '64000', volume: '1234', quoteVolume: '78000000', closeTime: 1770000000000,
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('Binance Home Dashboard Live Market Summary Scoped Snapshot Acquisition Port Adapter Foundation', () => {
  it('binds caller-owned session/readObservedAt and delegates one explicit scope acquisition', async () => {
    const session = createLiveMarketSummaryStateSession();
    const transition = vi.spyOn(session, 'transition');
    const getState = vi.spyOn(session, 'getState');
    const readObservedAt = vi.fn(() => observedAt);
    globalThis.fetch = vi.fn(async () => ({ text: async () => payload })) as unknown as typeof fetch;
    const port = createBinanceHomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort(session, readObservedAt);
    const scope = [btc] as const;

    const result = await port.acquire(scope);

    expect(transition).toHaveBeenCalledTimes(1);
    expect(getState).toHaveBeenCalledTimes(1);
    expect(readObservedAt).toHaveBeenCalledTimes(1);
    expect(result.orchestrationResult.ok).toBe(true);
    expect(result.scopedSnapshot).toHaveLength(1);
    expect(result.scopedSnapshot[0]?.instrument).toBe(btc);
    expect(result.scopedSnapshot[0]?.fact?.observedAt).toBe(observedAt);
  });

  it('forwards the exact caller-owned AbortSignal through the released provider composition', async () => {
    const session = createLiveMarketSummaryStateSession();
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => ({ text: async () => payload, init }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const port = createBinanceHomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort(session, () => observedAt);

    await expect(port.acquire([btc], { signal: controller.signal })).resolves.toMatchObject({
      orchestrationResult: { ok: true },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
});
