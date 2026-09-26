import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribeBinanceSpotBrowserPublicTradeStream } from '../src/services/market-data';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly listeners = new Map<string, Array<(event: any) => void>>();
  close = vi.fn();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: any) => void) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string, event: any) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

describe('P16.16 Binance Spot browser public trade subscription', () => {
  const originalWebSocket = globalThis.WebSocket;

  afterEach(() => {
    FakeWebSocket.instances = [];
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      writable: true,
      value: originalWebSocket,
    });
  });

  it('composes browser transport, lifecycle state, trade delivery, and idempotent close ownership', () => {
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      writable: true,
      value: FakeWebSocket,
    });

    const onPrice = vi.fn();
    const onStateChange = vi.fn();
    const receiptTimestamp = vi.fn(() => '2026-09-03T05:30:00.000Z');

    const result = subscribeBinanceSpotBrowserPublicTradeStream(
      { venue: 'binance-spot', symbol: 'BTCUSDT' },
      { onPrice, onStateChange },
      receiptTimestamp,
    );

    expect(result.ok).toBe(true);
    expect(FakeWebSocket.instances).toHaveLength(1);
    const socket = FakeWebSocket.instances[0]!;
    expect(socket.url).toBe('wss://stream.binance.com:9443/ws/btcusdt@trade');
    expect(onStateChange).toHaveBeenCalledWith('connecting');

    socket.emit('open', {});
    expect(onStateChange).toHaveBeenLastCalledWith('live');

    socket.emit('message', {
      data: JSON.stringify({
        e: 'trade', E: 1672515782136, s: 'BTCUSDT',
        p: '123.4500', T: 1672515782136,
      }),
    });
    expect(receiptTimestamp).toHaveBeenCalledTimes(1);
    expect(onPrice).toHaveBeenCalledWith(expect.objectContaining({
      price: '123.4500',
      observedAt: '2026-09-03T05:30:00.000Z',
      sourceTimestamp: '2022-12-31T19:43:02.136Z',
    }));

    if (result.ok) {
      result.subscription.close();
      result.subscription.close();
    }
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid venue before constructing a browser WebSocket', () => {
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      writable: true,
      value: FakeWebSocket,
    });

    const result = subscribeBinanceSpotBrowserPublicTradeStream(
      { venue: 'other', symbol: 'BTCUSDT' },
      { onPrice: vi.fn() },
      () => '2026-09-03T05:30:00.000Z',
    );

    expect(result).toEqual({ ok: false, reason: 'venue-mismatch' });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('forwards native transport failure through lifecycle and error owners without price invention', () => {
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      writable: true,
      value: FakeWebSocket,
    });

    const onPrice = vi.fn();
    const onError = vi.fn();
    const onStateChange = vi.fn();
    const result = subscribeBinanceSpotBrowserPublicTradeStream(
      { venue: 'binance-spot', symbol: 'BTCUSDT' },
      { onPrice, onError, onStateChange },
      () => '2026-09-03T05:30:00.000Z',
    );

    expect(result.ok).toBe(true);
    const error = new Event('error');
    FakeWebSocket.instances[0]!.emit('error', error);
    expect(onStateChange).toHaveBeenLastCalledWith('error');
    expect(onError).toHaveBeenCalledWith(error);
    expect(onPrice).not.toHaveBeenCalled();
  });
});
