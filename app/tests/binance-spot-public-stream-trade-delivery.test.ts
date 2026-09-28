import { describe, expect, it, vi } from 'vitest';
import { deliverBinanceSpotPublicStreamTradeMessage } from '../src/services/market-data';

describe('P16.8 Binance Spot public stream trade delivery', () => {
  it('delivers a valid mapped trade exactly once through the P15 price handler', () => {
    const onPrice = vi.fn();
    const onError = vi.fn();

    const result = deliverBinanceSpotPublicStreamTradeMessage(
      '{"e":"trade","s":"BTCUSDT","p":"42123.45000000","T":1672515782136}',
      '2026-09-03T03:30:00.000Z',
      { onPrice, onError },
    );

    expect(result).toEqual({
      ok: true,
      kind: 'delivered',
      observation: {
        instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' },
        price: '42123.45000000',
        observedAt: '2026-09-03T03:30:00.000Z',
        sourceTimestamp: '2022-12-31T19:43:02.136Z',
      },
    });
    expect(onPrice).toHaveBeenCalledTimes(1);
    expect(onPrice).toHaveBeenCalledWith(result.ok && result.kind === 'delivered' ? result.observation : undefined);
    expect(onError).not.toHaveBeenCalled();
  });

  it('leaves non-trade provider events ignored and does not emit price or error callbacks', () => {
    const onPrice = vi.fn();
    const onError = vi.fn();

    expect(
      deliverBinanceSpotPublicStreamTradeMessage(
        '{"e":"serverShutdown","E":1770123456789}',
        '2026-09-03T03:30:00.000Z',
        { onPrice, onError },
      ),
    ).toEqual({ ok: true, kind: 'ignored' });

    expect(onPrice).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports malformed or invalid trade messages through the P15 error handler without emitting price', () => {
    const onPrice = vi.fn();
    const onError = vi.fn();

    expect(
      deliverBinanceSpotPublicStreamTradeMessage(
        '{"e":"trade"',
        '2026-09-03T03:30:00.000Z',
        { onPrice, onError },
      ),
    ).toEqual({ ok: false, kind: 'rejected', reason: 'invalid-json' });

    expect(onPrice).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith({
      provider: 'binance-spot',
      stage: 'trade-message',
      reason: 'invalid-json',
    });
  });
});
