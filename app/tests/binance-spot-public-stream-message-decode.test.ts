import { describe, expect, it } from 'vitest';
import { decodeBinanceSpotPublicStreamMessage } from '../src/services/market-data';

describe('P16.5 Binance Spot public stream JSON message decode', () => {
  it('decodes a raw Binance Spot trade JSON text frame without changing lexical decimal strings', () => {
    const result = decodeBinanceSpotPublicStreamMessage(
      '{"e":"trade","s":"BTCUSDT","p":"42123.45000000","T":1672515782136}',
    );

    expect(result).toEqual({
      ok: true,
      payload: {
        e: 'trade',
        s: 'BTCUSDT',
        p: '42123.45000000',
        T: 1672515782136,
      },
    });
  });

  it('keeps non-trade JSON transport messages generic for later semantic owners', () => {
    const result = decodeBinanceSpotPublicStreamMessage(
      '{"e":"serverShutdown","E":1770123456789}',
    );

    expect(result).toEqual({
      ok: true,
      payload: {
        e: 'serverShutdown',
        E: 1770123456789,
      },
    });
  });

  it('rejects malformed JSON text deterministically', () => {
    expect(
      decodeBinanceSpotPublicStreamMessage('{"e":"trade"'),
    ).toEqual({
      ok: false,
      reason: 'invalid-json',
    });
  });

  it('rejects non-text message data instead of inventing binary decoding', () => {
    expect(
      decodeBinanceSpotPublicStreamMessage(new Uint8Array([1, 2, 3])),
    ).toEqual({
      ok: false,
      reason: 'unsupported-message-data',
    });
  });
});
