import { describe, expect, it, vi } from 'vitest';
import {
  createBinanceSpot24hPublicRestBaselineAcquisitionPort,
} from '../src/services/market-data';

const scope = [{ venue: 'binance-spot', symbol: 'BTCUSDT' }] as const;
const observedAt = '2026-09-07T10:40:00.000Z';
const payload = JSON.stringify({
  symbol: 'BTCUSDT', openPrice: '62000', highPrice: '65000', lowPrice: '61000',
  lastPrice: '64000', volume: '1234', quoteVolume: '78000000', closeTime: 1770000000000,
});

describe('P21.13 Binance Spot baseline acquisition adapter foundation', () => {
  it('implements the P21.4 port by composing the released P21.11/P21.12 round trip', async () => {
    const connect = vi.fn(async () => payload);
    const readObservedAt = vi.fn(() => observedAt);
    const port = createBinanceSpot24hPublicRestBaselineAcquisitionPort(connect, readObservedAt);
    const result = await port.acquireBaseline(scope);
    expect(result.ok).toBe(true);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(readObservedAt).toHaveBeenCalledTimes(1);
    if (result.ok) {
      expect(result.delivery.completeness).toBe('complete-for-scope');
      expect(result.delivery.scope).toEqual(scope);
      expect(result.delivery.facts[0]?.observedAt).toBe(observedAt);
    }
  });

  it('forwards the exact caller-owned AbortSignal from the P21.4 port into P21.12', async () => {
    const controller = new AbortController();
    const options = { signal: controller.signal } as const;
    const connect = vi.fn(async (_request: unknown, received?: { readonly signal?: AbortSignal }) => {
      expect(received).toBe(options);
      expect(received?.signal).toBe(controller.signal);
      return payload;
    });
    const port = createBinanceSpot24hPublicRestBaselineAcquisitionPort(connect, () => observedAt);
    await expect(port.acquireBaseline(scope, options)).resolves.toMatchObject({ ok: true });
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('maps released request/response composition failure to the P21.4 acquisition-failed result', async () => {
    const port = createBinanceSpot24hPublicRestBaselineAcquisitionPort(async () => '{bad-json', () => observedAt);
    await expect(port.acquireBaseline(scope)).resolves.toEqual({ ok: false, reason: 'acquisition-failed' });
  });

  it('maps connector rejection to acquisition-failed without inventing abort/error interpretation', async () => {
    const failure = new Error('connector-owned-failure');
    const port = createBinanceSpot24hPublicRestBaselineAcquisitionPort(async () => { throw failure; }, () => observedAt);
    await expect(port.acquireBaseline(scope)).resolves.toEqual({ ok: false, reason: 'acquisition-failed' });
  });
});
