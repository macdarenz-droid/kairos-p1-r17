import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acquireBinanceSpot24hBrowserPublicRestBaselineIntoSessionAndReadScopedSnapshot,
  createLiveMarketSummaryStateSession,
  type LiveMarketSummaryStateSession,
  type MarketDataInstrument,
} from '../src/services/market-data';

const originalFetch = globalThis.fetch;
const btc: MarketDataInstrument = { venue: 'binance-spot', symbol: 'BTCUSDT' };
const scope = [btc] as const;
const observedAt = '2026-09-08T07:00:00.000Z';
const payload = JSON.stringify({
  symbol: 'BTCUSDT', openPrice: '62000', highPrice: '65000', lowPrice: '61000',
  lastPrice: '64000', volume: '1234', quoteVolume: '78000000', closeTime: 1770000000000,
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('P21.23 Live Market Summary Browser State Session Scoped Snapshot Acquisition Composition Foundation', () => {
  it('performs one released acquisition before one scoped read from the same session and scope', async () => {
    const session = createLiveMarketSummaryStateSession();
    const transition = vi.spyOn(session, 'transition');
    const getState = vi.spyOn(session, 'getState');
    globalThis.fetch = vi.fn(async () => ({ text: async () => payload })) as unknown as typeof fetch;
    const readObservedAt = vi.fn(() => observedAt);

    const result = await acquireBinanceSpot24hBrowserPublicRestBaselineIntoSessionAndReadScopedSnapshot(
      session,
      readObservedAt,
      scope,
    );

    expect(transition).toHaveBeenCalledTimes(1);
    expect(readObservedAt).toHaveBeenCalledTimes(1);
    expect(getState).toHaveBeenCalledTimes(1);
    expect(result.orchestrationResult.ok).toBe(true);
    expect(result.scopedSnapshot).toHaveLength(1);
    expect(result.scopedSnapshot[0]?.instrument).toBe(btc);
    expect(result.scopedSnapshot[0]?.fact?.observedAt).toBe(observedAt);
  });

  it('preserves caller-owned acquisition options through released P21.20', async () => {
    const session = createLiveMarketSummaryStateSession();
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => ({ text: async () => payload, init }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(acquireBinanceSpot24hBrowserPublicRestBaselineIntoSessionAndReadScopedSnapshot(
      session,
      () => observedAt,
      [btc],
      { signal: controller.signal },
    )).resolves.toMatchObject({ orchestrationResult: { ok: true } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it('propagates a released P21.20 rejection unchanged and performs no scoped read', async () => {
    const failure = new Error('session-transition-rejection');
    const getState = vi.fn();
    const session = {
      transition: vi.fn(async () => { throw failure; }),
      getState,
    } as unknown as LiveMarketSummaryStateSession;

    await expect(acquireBinanceSpot24hBrowserPublicRestBaselineIntoSessionAndReadScopedSnapshot(
      session,
      () => observedAt,
      [btc],
    )).rejects.toBe(failure);

    expect(session.transition).toHaveBeenCalledTimes(1);
    expect(getState).not.toHaveBeenCalled();
  });
});
