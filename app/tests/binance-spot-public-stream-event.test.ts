import { describe, expect, it } from 'vitest';
import { classifyBinanceSpotPublicStreamEvent } from '../src/services/market-data';

describe('P16.6 Binance Spot public stream event classification', () => {
  it('classifies a decoded trade event without mapping it into an observation', () => {
    const payload = {
      e: 'trade',
      s: 'BTCUSDT',
      p: '42123.45000000',
      T: 1672515782136,
    };

    expect(classifyBinanceSpotPublicStreamEvent(payload)).toEqual({
      kind: 'trade',
      payload,
    });
  });

  it('classifies the documented raw serverShutdown event and preserves event time', () => {
    expect(
      classifyBinanceSpotPublicStreamEvent({
        e: 'serverShutdown',
        E: 1770123456789,
      }),
    ).toEqual({
      kind: 'server-shutdown',
      eventTime: 1770123456789,
    });
  });

  it('does not treat malformed serverShutdown payloads as reconnect authority', () => {
    const payload = { e: 'serverShutdown', E: '1770123456789' };

    expect(classifyBinanceSpotPublicStreamEvent(payload)).toEqual({
      kind: 'other',
      payload,
    });
  });

  it('keeps unknown events explicit and unchanged', () => {
    const payload = { e: 'depthUpdate', s: 'BTCUSDT' };

    expect(classifyBinanceSpotPublicStreamEvent(payload)).toEqual({
      kind: 'other',
      payload,
    });
  });
});
