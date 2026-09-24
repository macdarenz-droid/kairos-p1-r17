import { describe, expect, it, vi } from 'vitest';
import {
  describeBinanceSpotPublicRawStreamEndpoint,
  describeBinanceSpotTradeStream,
  openBinanceSpotPublicRawStreamConnection,
} from '../src/services/market-data';

function endpointFor(symbol: string) {
  const stream = describeBinanceSpotTradeStream({
    venue: 'binance-spot',
    symbol,
  });
  if (!stream.ok) throw new Error('expected valid Binance Spot stream');
  return describeBinanceSpotPublicRawStreamEndpoint(stream);
}

describe('P16.4 Binance Spot injected public stream connection boundary', () => {
  it('passes the P16.3 endpoint URL and handlers into the injected connector exactly once', () => {
    const onMessage = vi.fn();
    const handlers = { onMessage };
    const close = vi.fn();
    const connect = vi.fn(() => ({ close }));
    const endpoint = endpointFor('BTCUSDT');

    const connection = openBinanceSpotPublicRawStreamConnection(
      endpoint,
      handlers,
      connect,
    );

    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(
      'wss://stream.binance.com:9443/ws/btcusdt@trade',
      handlers,
    );
    expect(connection.close).toBe(close);
  });

  it('forwards raw provider messages through the supplied handler without mapping or clock acquisition', () => {
    const onMessage = vi.fn();
    const connect = vi.fn((_url, handlers) => {
      handlers.onMessage({ e: 'trade', s: 'ETHUSDT', p: '2500.10' });
      return { close: vi.fn() };
    });

    openBinanceSpotPublicRawStreamConnection(
      endpointFor('ETHUSDT'),
      { onMessage },
      connect,
    );

    expect(onMessage).toHaveBeenCalledWith({
      e: 'trade',
      s: 'ETHUSDT',
      p: '2500.10',
    });
  });

  it('does not create retries or additional connections when the returned connection closes', () => {
    const close = vi.fn();
    const connect = vi.fn(() => ({ close }));

    const connection = openBinanceSpotPublicRawStreamConnection(
      endpointFor('BTCUSDT'),
      { onMessage: vi.fn() },
      connect,
    );

    connection.close();
    expect(close).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
