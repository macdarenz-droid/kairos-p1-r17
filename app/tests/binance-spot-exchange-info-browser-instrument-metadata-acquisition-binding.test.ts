import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetBinanceSpotExchangeInfoCache } from '../src/services/market-data';
import { createBinanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionPort } from '../src/services/market-data';

const originalFetch = globalThis.fetch;
const payload = JSON.stringify({ symbols: [
  { symbol: 'BTCUSDT', status: 'TRADING', baseAsset: 'BTC', quoteAsset: 'USDT' },
  { symbol: 'ETHUSDT', status: 'TRADING', baseAsset: 'ETH', quoteAsset: 'USDT' },
] });

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

beforeEach(() => {
  resetBinanceSpotExchangeInfoCache();
});

describe('Binance Spot exchangeInfo browser instrument metadata acquisition binding foundation', () => {
  it('composes the released metadata adapter with the released browser connector', async () => {
    const text = vi.fn(async () => payload);
    const fetchMock = vi.fn(async () => ({ text }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const port = createBinanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionPort();

    const result = await port.acquireInstrumentMetadata();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(text).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.facts).toHaveLength(2);
  });

  it('ends only the aborting caller\'s wait and never hands the caller signal to the shared request', async () => {
    const controller = new AbortController();
    let capturedSignal: AbortSignal | null | undefined;
    let release: (value: { text: () => Promise<string> }) => void = () => undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedSignal = init?.signal;
      return new Promise((resolve) => { release = resolve; });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const port = createBinanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionPort();

    const aborting = port.acquireInstrumentMetadata({ signal: controller.signal });
    const waiting = port.acquireInstrumentMetadata();
    controller.abort();

    await expect(aborting).resolves.toEqual({ ok: false, reason: 'acquisition-failed' });
    expect(capturedSignal).not.toBe(controller.signal);
    expect(capturedSignal?.aborted).toBe(false);
    release({ text: async () => payload });
    const result = await waiting;
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves the released acquisition-failed mapping for native browser rejection', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('native-fetch-failure'); }) as unknown as typeof fetch;
    const port = createBinanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionPort();
    await expect(port.acquireInstrumentMetadata()).resolves.toEqual({ ok: false, reason: 'acquisition-failed' });
  });

  it('preserves the released acquisition-failed mapping for invalid provider payload', async () => {
    globalThis.fetch = vi.fn(async () => ({ text: async () => '{"symbols":' })) as unknown as typeof fetch;
    const port = createBinanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionPort();
    await expect(port.acquireInstrumentMetadata()).resolves.toEqual({ ok: false, reason: 'acquisition-failed' });
  });
});
