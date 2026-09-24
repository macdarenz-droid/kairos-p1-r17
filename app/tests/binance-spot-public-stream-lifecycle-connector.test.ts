import { describe, expect, it, vi } from 'vitest';
import { withBinanceSpotPublicStreamLifecycle } from '../src/services/market-data';

describe('P16.13 Binance Spot public-stream lifecycle connector', () => {
  it('translates connect/open/close evidence through the P15 state machine', () => {
    const states: string[] = [];
    let transportHandlers: any;
    const underlyingClose = vi.fn();
    const connect = vi.fn((_url: string, handlers: any) => {
      transportHandlers = handlers;
      return { close: underlyingClose };
    });
    const onOpen = vi.fn();
    const onClose = vi.fn();

    const decorated = withBinanceSpotPublicStreamLifecycle({
      connect,
      handlers: { onStateChange: (state) => states.push(state) },
    });
    const connection = decorated('wss://example.test/ws/btcusdt@trade', {
      onMessage: vi.fn(),
      onOpen,
      onClose,
    });

    expect(states).toEqual(['connecting']);
    transportHandlers.onOpen();
    expect(states).toEqual(['connecting', 'live']);
    transportHandlers.onClose({ code: 1006 });
    expect(states).toEqual(['connecting', 'live', 'disconnected']);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith({ code: 1006 });

    connection.close();
    expect(underlyingClose).toHaveBeenCalledTimes(1);
  });

  it('reports a transport failure once and does not invent a later disconnected transition', () => {
    const states: string[] = [];
    let transportHandlers: any;
    const onError = vi.fn();
    const connect = vi.fn((_url: string, handlers: any) => {
      transportHandlers = handlers;
      return { close: vi.fn() };
    });

    const decorated = withBinanceSpotPublicStreamLifecycle({
      connect,
      handlers: { onStateChange: (state) => states.push(state) },
    });
    decorated('wss://example.test/ws/btcusdt@trade', {
      onMessage: vi.fn(),
      onError,
    });

    const failure = new Error('transport');
    transportHandlers.onError(failure);
    transportHandlers.onClose({ code: 1006 });

    expect(states).toEqual(['connecting', 'error']);
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it('does not make explicit close invent a state transition before transport close evidence', () => {
    const states: string[] = [];
    const close = vi.fn();
    const connect = vi.fn(() => ({ close }));
    const decorated = withBinanceSpotPublicStreamLifecycle({
      connect,
      handlers: { onStateChange: (state) => states.push(state) },
    });
    const connection = decorated('wss://example.test/ws/btcusdt@trade', {
      onMessage: vi.fn(),
    });

    connection.close();

    expect(close).toHaveBeenCalledTimes(1);
    expect(states).toEqual(['connecting']);
  });
});
