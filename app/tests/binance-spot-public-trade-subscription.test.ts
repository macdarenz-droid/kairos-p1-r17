import { describe, expect, it, vi } from 'vitest';
import { subscribeBinanceSpotPublicTradeStream } from '../src/services/market-data';

describe('P16.9 Binance Spot public trade subscription', () => {
  it('composes the BTCUSDT raw endpoint and delivers received trades with caller-owned receipt time', () => {
    const onPrice = vi.fn();
    const receiptTimestamp = vi.fn(() => '2026-09-03T04:00:00.000Z');
    let inbound: ((payload: unknown) => void) | undefined;
    const close = vi.fn();
    const connect = vi.fn((url: string, handlers: { onMessage: (payload: unknown) => void }) => {
      inbound = handlers.onMessage;
      return { close };
    });

    const result = subscribeBinanceSpotPublicTradeStream(
      { venue: 'binance-spot', symbol: 'BTCUSDT' },
      { onPrice },
      connect,
      receiptTimestamp,
    );

    expect(result.ok).toBe(true);
    expect(connect).toHaveBeenCalledWith(
      'wss://stream.binance.com:9443/ws/btcusdt@trade',
      expect.any(Object),
    );
    expect(receiptTimestamp).not.toHaveBeenCalled();

    inbound?.(JSON.stringify({ e: 'trade', E: 1672515782136, s: 'BTCUSDT', p: '123.4500', T: 1672515782136 }));

    expect(receiptTimestamp).toHaveBeenCalledTimes(1);
    expect(onPrice).toHaveBeenCalledTimes(1);
    expect(onPrice).toHaveBeenCalledWith(expect.objectContaining({
      price: '123.4500',
      observedAt: '2026-09-03T04:00:00.000Z',
      sourceTimestamp: '2022-12-31T19:43:02.136Z',
    }));

    if (result.ok) result.subscription.close();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-Binance venue before connection creation or clock acquisition', () => {
    const connect = vi.fn();
    const receiptTimestamp = vi.fn(() => '2026-09-03T04:00:00.000Z');
    const result = subscribeBinanceSpotPublicTradeStream(
      { venue: 'other', symbol: 'BTCUSDT' },
      { onPrice: vi.fn() },
      connect,
      receiptTimestamp,
    );
    expect(result).toEqual({ ok: false, reason: 'venue-mismatch' });
    expect(connect).not.toHaveBeenCalled();
    expect(receiptTimestamp).not.toHaveBeenCalled();
  });

  it('forwards transport errors without inventing state or price observations', () => {
    const onPrice = vi.fn();
    const onError = vi.fn();
    let fail: ((error: unknown) => void) | undefined;
    const connect = vi.fn((_url: string, handlers: { onMessage: (payload: unknown) => void; onError?: (error: unknown) => void }) => {
      fail = handlers.onError;
      return { close: vi.fn() };
    });
    const result = subscribeBinanceSpotPublicTradeStream(
      { venue: 'binance-spot', symbol: 'BTCUSDT' },
      { onPrice, onError },
      connect,
      () => '2026-09-03T04:00:00.000Z',
    );
    expect(result.ok).toBe(true);
    const error = new Error('transport');
    fail?.(error);
    expect(onError).toHaveBeenCalledWith(error);
    expect(onPrice).not.toHaveBeenCalled();
  });
});
