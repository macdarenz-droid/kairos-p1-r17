import { describe, expect, it } from 'vitest';
import {
  BINANCE_SPOT_PUBLIC_STREAM_HOST,
  BINANCE_SPOT_PUBLIC_STREAM_PORTS,
  describeBinanceSpotPublicRawStreamEndpoint,
  describeBinanceSpotTradeStream,
} from '../src/services/market-data';

describe('P16.3 Binance Spot public stream endpoint semantics', () => {
  it('composes the default production raw-stream endpoint from the P16.1 descriptor', () => {
    const stream = describeBinanceSpotTradeStream({
      venue: 'binance-spot',
      symbol: 'BTCUSDT',
    });

    expect(stream.ok).toBe(true);
    if (!stream.ok) return;

    expect(describeBinanceSpotPublicRawStreamEndpoint(stream)).toEqual({
      host: 'stream.binance.com',
      port: '9443',
      streamName: 'btcusdt@trade',
      url: 'wss://stream.binance.com:9443/ws/btcusdt@trade',
    });
  });

  it('supports Binance documented production port 443 without changing stream identity', () => {
    const stream = describeBinanceSpotTradeStream({
      venue: 'binance-spot',
      symbol: 'ETHUSDT',
    });

    expect(stream.ok).toBe(true);
    if (!stream.ok) return;

    expect(describeBinanceSpotPublicRawStreamEndpoint(stream, '443')).toEqual({
      host: 'stream.binance.com',
      port: '443',
      streamName: 'ethusdt@trade',
      url: 'wss://stream.binance.com:443/ws/ethusdt@trade',
    });
  });

  it('pins only the two documented production public-stream ports', () => {
    expect(BINANCE_SPOT_PUBLIC_STREAM_HOST).toBe('stream.binance.com');
    expect(BINANCE_SPOT_PUBLIC_STREAM_PORTS).toEqual(['9443', '443']);
  });
});
