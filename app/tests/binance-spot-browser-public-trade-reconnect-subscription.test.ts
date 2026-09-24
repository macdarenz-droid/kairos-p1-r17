import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribeBinanceSpotBrowserPublicTradeStreamWithReconnect } from '../src/services/market-data/providers/binance/binanceSpotBrowserPublicTradeReconnectSubscription';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly url: string;
  private listeners = new Map<string, Array<(event: Event | MessageEvent | CloseEvent) => void>>();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Event | MessageEvent | CloseEvent) => void) {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  emit(type: string, event: Event | MessageEvent | CloseEvent) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWebSocket.instances = [];
});

describe('P16.17 browser public trade reconnect subscription', () => {
  it('schedules P15-owned reconnect on serverShutdown and reconnects without delivering it as price data', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const scheduled: Array<{ cb: () => void; delay: number; handle: object }> = [];
    const cancel = vi.fn();
    const onPrice = vi.fn();
    const onStateChange = vi.fn();
    const scheduler = {
      schedule: (cb: () => void, delay: number) => {
        const handle = {};
        scheduled.push({ cb, delay, handle });
        return handle;
      },
      cancel,
    };

    const result = subscribeBinanceSpotBrowserPublicTradeStreamWithReconnect(
      { venue: 'binance-spot', symbol: 'BTCUSDT' },
      { onPrice, onStateChange },
      () => '2026-09-03T05:00:00.000Z',
      scheduler,
      { initialDelayMs: 100, maxDelayMs: 1000, maxAttempts: 3 },
      () => 0.5,
    );

    expect(result.ok).toBe(true);
    expect(FakeWebSocket.instances).toHaveLength(1);
    const first = FakeWebSocket.instances[0];
    first.emit('message', { data: JSON.stringify({ e: 'serverShutdown', E: 1770123456789 }) } as MessageEvent);
    expect(onPrice).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].delay).toBeGreaterThanOrEqual(0);

    scheduled[0].cb();
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(2);

    if (result.ok) result.subscription.close();
    expect(FakeWebSocket.instances[1].close).toHaveBeenCalledTimes(1);
  });

  it('close cancels a pending reconnect and closes the active socket idempotently', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const scheduled: Array<{ cb: () => void; handle: object }> = [];
    const cancel = vi.fn();
    const result = subscribeBinanceSpotBrowserPublicTradeStreamWithReconnect(
      { venue: 'binance-spot', symbol: 'BTCUSDT' },
      { onPrice: vi.fn() },
      () => '2026-09-03T05:00:00.000Z',
      { schedule: (cb) => { const handle={}; scheduled.push({cb,handle}); return handle; }, cancel },
      { initialDelayMs: 100, maxDelayMs: 1000, maxAttempts: 3 },
      () => 0.5,
    );
    expect(result.ok).toBe(true);
    const first=FakeWebSocket.instances[0];
    first.emit('message', { data: JSON.stringify({ e: 'serverShutdown', E: 1770123456789 }) } as MessageEvent);
    if (result.ok) {
      result.subscription.close();
      result.subscription.close();
    }
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(first.close).toHaveBeenCalledTimes(1);
    scheduled[0].cb();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
