import { describe, expect, it } from 'vitest';
import { mapBinanceSpotPublicStreamTradeMessage } from '../src/services/market-data';

describe('P16.7 Binance Spot public stream trade message composition', () => {
  it('decodes, classifies, and maps a BTCUSDT trade using caller-owned receipt time', () => {
    const result = mapBinanceSpotPublicStreamTradeMessage(
      '{"e":"trade","s":"BTCUSDT","p":"42123.45000000","T":1672515782136}',
      '2026-09-03T02:30:00.000Z',
    );

    expect(result).toEqual({
      ok: true,
      kind: 'trade',
      observation: {
        instrument: {
          venue: 'binance-spot',
          symbol: 'BTCUSDT',
        },
        price: '42123.45000000',
        sourceTimestamp: '2022-12-31T19:43:02.136Z',
        observedAt: '2026-09-03T02:30:00.000Z',
      },
    });
  });

  it('ignores serverShutdown here so lifecycle policy remains separately owned', () => {
    expect(
      mapBinanceSpotPublicStreamTradeMessage(
        '{"e":"serverShutdown","E":1770123456789}',
        '2026-09-03T02:30:00.000Z',
      ),
    ).toEqual({ ok: true, kind: 'ignored' });
  });

  it('rejects malformed JSON without constructing an observation', () => {
    expect(
      mapBinanceSpotPublicStreamTradeMessage('{"e":"trade"', '2026-09-03T02:30:00.000Z'),
    ).toEqual({ ok: false, reason: 'invalid-json' });
  });

  it('rejects semantically invalid trade payloads after successful decoding', () => {
    expect(
      mapBinanceSpotPublicStreamTradeMessage(
        '{"e":"trade","s":"BTCUSDT","p":"not-a-price","T":1672515782136}',
        '2026-09-03T02:30:00.000Z',
      ),
    ).toEqual({ ok: false, reason: 'invalid-trade' });
  });
});
