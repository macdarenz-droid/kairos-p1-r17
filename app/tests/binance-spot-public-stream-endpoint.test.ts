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
      host: 'data-stream.binance.vision',
      port: '443',
      streamName: 'btcusdt@trade',
      url: 'wss://data-stream.binance.vision:443/ws/btcusdt@trade',
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
      host: 'data-stream.binance.vision',
      port: '443',
      streamName: 'ethusdt@trade',
      url: 'wss://data-stream.binance.vision:443/ws/ethusdt@trade',
    });
  });

  it('pins the market-data stream host and its one answering port', () => {
    expect(BINANCE_SPOT_PUBLIC_STREAM_HOST).toBe('data-stream.binance.vision');
    expect(BINANCE_SPOT_PUBLIC_STREAM_PORTS).toEqual(['443']);
  });
});
