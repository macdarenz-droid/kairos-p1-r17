import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectBinanceSpotBrowserStream } from '../src/services/market-data';

class FakeWebSocket extends EventTarget {
  static instances: FakeWebSocket[] = [];
  readonly url: string;
  readonly close = vi.fn();

  constructor(url: string | URL) {
    super();
    this.url = String(url);
    FakeWebSocket.instances.push(this);
  }
}

const originalWebSocket = globalThis.WebSocket;

afterEach(() => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = originalWebSocket;
});

describe('P16.12 Binance Spot browser stream connector', () => {
  it('opens exactly one native browser transport for the supplied secure endpoint', () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    connectBinanceSpotBrowserStream(
      'wss://stream.binance.com:9443/ws/btcusdt@trade',
      { onMessage: vi.fn() },
    );

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]?.url).toBe(
      'wss://stream.binance.com:9443/ws/btcusdt@trade',
    );
  });

  it('forwards native open, message data, error, and close evidence without provider mapping', () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    const onOpen = vi.fn();
    const onMessage = vi.fn();
    const onError = vi.fn();
    const onClose = vi.fn();

    connectBinanceSpotBrowserStream('wss://example.test/ws/feed', {
      onOpen,
      onMessage,
      onError,
      onClose,
    });

    const socket = FakeWebSocket.instances[0];
    if (!socket) throw new Error('expected browser transport instance');

    socket.dispatchEvent(new Event('open'));
    const message = new MessageEvent('message', { data: '{"e":"trade"}' });
    socket.dispatchEvent(message);
    const error = new Event('error');
    socket.dispatchEvent(error);
    const close = new CloseEvent('close', { code: 1000, reason: 'done' });
    socket.dispatchEvent(close);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith('{"e":"trade"}');
    expect(onError).toHaveBeenCalledWith(error);
    expect(onClose).toHaveBeenCalledWith(close);
  });

  it('makes close idempotent and does not reconnect', () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    const connection = connectBinanceSpotBrowserStream(
      'wss://example.test/ws/feed',
      { onMessage: vi.fn() },
    );
    const socket = FakeWebSocket.instances[0];
    if (!socket) throw new Error('expected browser transport instance');

    connection.close();
    connection.close();

    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
