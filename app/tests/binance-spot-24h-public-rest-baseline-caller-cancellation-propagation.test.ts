import { describe, expect, it, vi } from 'vitest';
import {
  composeBinanceSpot24hPublicRestBaselineRoundTrip,
  describeBinanceSpot24hPublicRestBaselineRequest,
  executeBinanceSpot24hPublicRestBaselineRequest,
} from '../src/services/market-data';

const scope = [{ venue: 'binance-spot', symbol: 'BTCUSDT' }] as const;
const observedAt = '2026-09-07T08:55:00.000Z';
const payload = JSON.stringify({
  symbol: 'BTCUSDT', openPrice: '62000', highPrice: '65000', lowPrice: '61000',
  lastPrice: '64000', volume: '1234', quoteVolume: '78000000', closeTime: 1770000000000,
});

describe('P21.12 caller cancellation propagation foundation', () => {
  it('forwards the exact caller-owned signal unchanged through the P21.8 execution boundary', async () => {
    const described = describeBinanceSpot24hPublicRestBaselineRequest(scope);
    expect(described.ok).toBe(true);
    if (!described.ok) return;
    const controller = new AbortController();
    const options = { signal: controller.signal } as const;
    const connect = vi.fn(async () => payload);
    await executeBinanceSpot24hPublicRestBaselineRequest(described.request, connect, options);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(described.request, options);
  });

  it('propagates the same signal through the P21.11 round trip without creating cancellation policy', async () => {
    const controller = new AbortController();
    const options = { signal: controller.signal } as const;
    const connect = vi.fn(async (_request: unknown, received?: { readonly signal?: AbortSignal }) => {
      expect(received).toBe(options);
      expect(received?.signal).toBe(controller.signal);
      return payload;
    });
    const result = await composeBinanceSpot24hPublicRestBaselineRoundTrip(scope, observedAt, connect, options);
    expect(result.ok).toBe(true);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('preserves exact one-argument connector invocation for existing no-options callers', async () => {
    const described = describeBinanceSpot24hPublicRestBaselineRequest(scope);
    expect(described.ok).toBe(true);
    if (!described.ok) return;
    const connect = vi.fn(async () => payload);
    await executeBinanceSpot24hPublicRestBaselineRequest(described.request, connect);
    expect(connect).toHaveBeenCalledWith(described.request);
    expect(connect.mock.calls[0]).toHaveLength(1);
    await composeBinanceSpot24hPublicRestBaselineRoundTrip(scope, observedAt, connect);
    expect(connect.mock.calls[1]).toHaveLength(1);
  });

  it('preserves connector rejection behavior', async () => {
    const failure = new Error('connector-owned-failure');
    await expect(composeBinanceSpot24hPublicRestBaselineRoundTrip(scope, observedAt, async () => { throw failure; }))
      .rejects.toBe(failure);
  });
});
