import { describe, expect, it, vi } from 'vitest';
import {
  describeBinanceSpot24hPublicRestBaselineRequest,
  executeBinanceSpot24hPublicRestBaselineRequest,
} from '../src/services/market-data';

describe('P21.8 Binance Spot 24h public REST baseline request execution boundary foundation', () => {
  it('forwards the exact P21.7 descriptor once to an injected connector and returns its result unchanged', async () => {
    const described = describeBinanceSpot24hPublicRestBaselineRequest([
      { venue: 'binance-spot', symbol: 'BTCUSDT' },
    ]);
    expect(described.ok).toBe(true);
    if (!described.ok) return;
    const response = { transportOwned: true } as const;
    const connect = vi.fn(async () => response);
    await expect(executeBinanceSpot24hPublicRestBaselineRequest(described.request, connect)).resolves.toBe(response);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(described.request);
  });

  it('does not impose a response representation on the injected connector', async () => {
    const described = describeBinanceSpot24hPublicRestBaselineRequest([
      { venue: 'binance-spot', symbol: 'ETHUSDT' },
    ]);
    expect(described.ok).toBe(true);
    if (!described.ok) return;
    await expect(executeBinanceSpot24hPublicRestBaselineRequest(described.request, async () => 'raw-text'))
      .resolves.toBe('raw-text');
    await expect(executeBinanceSpot24hPublicRestBaselineRequest(described.request, async () => new Uint8Array([1, 2])))
      .resolves.toEqual(new Uint8Array([1, 2]));
  });
});
