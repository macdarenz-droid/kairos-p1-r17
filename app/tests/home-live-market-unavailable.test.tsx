import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveHomeLiveMarketLoadState, HomeDashboardGlassBubbleMap, HOME_LIVE_MARKET_START_TIMEOUT_MS } from '../src/app/HomeDashboardGlassBubbleMap';
import type { MarketDataUnavailable } from '../src/services/market-data/marketDataTypes';
import { glassTestModel } from './fixtures/homeDashboardGlassModel';
import { HomeRoute } from '../src/app/HomeRoute';
import { resetBinanceSpotExchangeInfoCache } from '../src/services/market-data';

const originalFetch = globalThis.fetch;
// Payloads from tests/binance-home-dashboard-live-market-runtime-bootstrap-foundation.test.ts:12-40.
const exchangeInfoPayload = JSON.stringify({ symbols: [
  { symbol: 'BTCUSDT', status: 'TRADING', baseAsset: 'BTC', quoteAsset: 'USDT' },
] });
const btc24hPayload = JSON.stringify({
  symbol: 'BTCUSDT', openPrice: '62000', highPrice: '65000', lowPrice: '61000',
  lastPrice: '64000', volume: '1234', quoteVolume: '78000000', closeTime: 1770000000000,
});

function marketFetch(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/v3/exchangeInfo')) return { text: async () => exchangeInfoPayload };
    if (url.includes('/api/v3/ticker/24hr')) return { text: async () => (url.includes('symbols=') ? `[${btc24hPayload}]` : btc24hPayload) };
    throw new Error(`unexpected URL: ${url}`);
  }) as unknown as typeof fetch;
}
const renderHome = () => render(<MemoryRouter><HomeRoute /></MemoryRouter>);

beforeEach(() => {
  resetBinanceSpotExchangeInfoCache();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('T-006 Home live market says when it cannot load', () => {
  it('shows the alert with "Try again" when fetch fails, and a retry that succeeds shows the bubbles', async () => {
    const failing = vi.fn(async () => { throw new Error('offline'); });
    globalThis.fetch = failing as unknown as typeof fetch;
    const { container } = renderHome();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Unavailable · Live prices');
    const calls = failing.mock.calls.length;

    const working = marketFetch();
    globalThis.fetch = working;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(working).toHaveBeenCalled());
    expect(failing.mock.calls.length).toBe(calls);
    await waitFor(() => expect(container.querySelectorAll('.kairos-glass-bubble').length).toBeGreaterThan(0));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the alert at once when the device is offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    globalThis.fetch = vi.fn(() => new Promise(() => undefined)) as unknown as typeof fetch;
    renderHome();
    expect(screen.getByRole('alert')).toHaveTextContent('Unavailable · Live prices');
  });

  it('shows "Loading live prices…" while starting, then the alert after 10 seconds without data', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(() => new Promise(() => undefined)) as unknown as typeof fetch;
    renderHome();
    expect(screen.getByRole('status')).toHaveTextContent('Loading live prices…');
    await act(async () => { vi.advanceTimersByTime(HOME_LIVE_MARKET_START_TIMEOUT_MS); });
    expect(screen.getByRole('alert')).toHaveTextContent('Unavailable · Live prices');
  });

  const failedWith = (why: MarketDataUnavailable['why']) => {
    const model = glassTestModel();
    const unavailable: MarketDataUnavailable = { ok: false, reason: 'unavailable', why, retryAfterSeconds: null };
    return { ...model, radiusScaleProjection: null, runtimeState: { ...model.runtimeState, status: 'acquisition-failed' as const, unavailable } };
  };

  it('says the port\'s reason: Binance refused this region', () => {
    render(<HomeDashboardGlassBubbleMap model={failedWith('region')} onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Unavailable · Live prices: Binance isn't available in your region");
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('retries once by itself when an offline failure comes back online', () => {
    const onRetry = vi.fn();
    render(<HomeDashboardGlassBubbleMap model={failedWith('offline')} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Unavailable · Live prices: you're offline.");
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('data always replaces the message', () => {
    for (const status of ['starting', 'running', 'acquisition-failed', 'bootstrap-error'] as const) {
      expect(deriveHomeLiveMarketLoadState({ hasData: true, status, online: false, startTimedOut: true })).toBe('data');
    }
    expect(deriveHomeLiveMarketLoadState({ hasData: false, status: 'running', online: true, startTimedOut: true })).toBe('loading');
    expect(deriveHomeLiveMarketLoadState({ hasData: false, status: 'starting', online: true, startTimedOut: false })).toBe('loading');
  });
});
