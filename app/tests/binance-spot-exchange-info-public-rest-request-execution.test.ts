import { describe, expect, it, vi } from 'vitest';
import {
  describeBinanceSpotExchangeInfoPublicRestRequest,
  executeBinanceSpotExchangeInfoPublicRestRequest,
} from '../src/services/market-data';

describe('Binance Spot exchangeInfo public REST request execution boundary foundation', () => {
  it('invokes an injected connector exactly once with the exact request when options are absent', async () => {
    const request = describeBinanceSpotExchangeInfoPublicRestRequest();
    const result = { body: 'provider-owned' } as const;
    const connect = vi.fn(async () => result);

    await expect(executeBinanceSpotExchangeInfoPublicRestRequest(request, connect)).resolves.toBe(result);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(request);
  });

  it('forwards caller-owned execution options unchanged', async () => {
    const request = describeBinanceSpotExchangeInfoPublicRestRequest();
    const controller = new AbortController();
    const options = { signal: controller.signal } as const;
    const connect = vi.fn(async () => 'ok');

    await expect(executeBinanceSpotExchangeInfoPublicRestRequest(request, connect, options)).resolves.toBe('ok');
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(request, options);
  });

  it('returns the exact connector Promise', () => {
    const request = describeBinanceSpotExchangeInfoPublicRestRequest();
    const promise = Promise.resolve('exact');
    const connect = vi.fn(() => promise);
    expect(executeBinanceSpotExchangeInfoPublicRestRequest(request, connect)).toBe(promise);
  });

  it('does not translate connector rejection', async () => {
    const request = describeBinanceSpotExchangeInfoPublicRestRequest();
    const failure = new Error('connector-failure');
    const connect = vi.fn(() => Promise.reject(failure));
    await expect(executeBinanceSpotExchangeInfoPublicRestRequest(request, connect)).rejects.toBe(failure);
  });
});
