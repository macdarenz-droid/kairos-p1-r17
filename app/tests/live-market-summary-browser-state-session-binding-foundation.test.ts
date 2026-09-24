import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acquireBinanceSpot24hBrowserPublicRestBaselineIntoSession,
  createLiveMarketSummaryDeliveryState,
  createLiveMarketSummaryStateSession,
  getLiveMarketSummaryDeliveryStateFact,
  type MarketDataInstrument,
} from '../src/services/market-data';

const originalFetch = globalThis.fetch;
const btc: MarketDataInstrument = { venue: 'binance-spot', symbol: 'BTCUSDT' };
const scope = [btc] as const;
const observedAt = '2026-09-08T04:30:00.000Z';
const payload = JSON.stringify({
  symbol: 'BTCUSDT', openPrice: '62000', highPrice: '65000', lowPrice: '61000',
  lastPrice: '64000', volume: '1234', quoteVolume: '78000000', closeTime: 1770000000000,
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('P21.20 Live Market Summary Browser State Session Binding Foundation', () => {
  it('executes exactly one explicit session transition and commits only released P21.18 result.state', async () => {
    const initial = createLiveMarketSummaryDeliveryState();
    const baseSession = createLiveMarketSummaryStateSession(initial);
    const transition = vi.spyOn(baseSession, 'transition');
    globalThis.fetch = vi.fn(async () => ({ text: async () => payload })) as unknown as typeof fetch;
    const readObservedAt = vi.fn(() => observedAt);

    const result = await acquireBinanceSpot24hBrowserPublicRestBaselineIntoSession(
      baseSession,
      readObservedAt,
      scope,
    );

    expect(result.ok).toBe(true);
    expect(transition).toHaveBeenCalledTimes(1);
    expect(readObservedAt).toHaveBeenCalledTimes(1);
    expect(baseSession.getState()).toBe(result.state);
    expect(getLiveMarketSummaryDeliveryStateFact(baseSession.getState(), btc)?.observedAt).toBe(observedAt);
  });

  it('preserves released acquisition-failed result and exact prior session state', async () => {
    const initial = createLiveMarketSummaryDeliveryState();
    const session = createLiveMarketSummaryStateSession(initial);
    globalThis.fetch = vi.fn(async () => { throw new Error('native-fetch-failure'); }) as unknown as typeof fetch;

    const result = await acquireBinanceSpot24hBrowserPublicRestBaselineIntoSession(
      session,
      () => observedAt,
      scope,
    );

    expect(result).toEqual({ ok: false, reason: 'acquisition-failed', state: initial });
    expect(result.state).toBe(initial);
    expect(session.getState()).toBe(initial);
  });

  it('forwards caller-owned acquisition options unchanged through released P21.18', async () => {
    const session = createLiveMarketSummaryStateSession();
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => ({ text: async () => payload, init }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(acquireBinanceSpot24hBrowserPublicRestBaselineIntoSession(
      session,
      () => observedAt,
      scope,
      { signal: controller.signal },
    )).resolves.toMatchObject({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
});
