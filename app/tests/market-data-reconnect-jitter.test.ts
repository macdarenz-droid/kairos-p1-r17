import { describe, expect, it } from 'vitest';
import { applyMarketDataReconnectFullJitter } from '../src/services/market-data';

describe('P15.7 market-data reconnect full-jitter semantics', () => {
  it('maps a normalized sample across the full backoff window', () => {
    expect(applyMarketDataReconnectFullJitter(1_000, 0)).toEqual({ accepted: true, delayMs: 0 });
    expect(applyMarketDataReconnectFullJitter(1_000, 0.5)).toEqual({ accepted: true, delayMs: 500 });
    expect(applyMarketDataReconnectFullJitter(1_000, 1)).toEqual({ accepted: true, delayMs: 1_000 });
  });

  it('uses integer millisecond output without owning randomness', () => {
    expect(applyMarketDataReconnectFullJitter(999, 0.333)).toEqual({
      accepted: true,
      delayMs: 332,
    });
  });

  it('accepts a zero-delay backoff window', () => {
    expect(applyMarketDataReconnectFullJitter(0, 0.7)).toEqual({
      accepted: true,
      delayMs: 0,
    });
  });

  it('rejects invalid base delays explicitly', () => {
    expect(applyMarketDataReconnectFullJitter(-1, 0.5)).toEqual({
      accepted: false,
      reason: 'invalid-delay',
    });
    expect(applyMarketDataReconnectFullJitter(1.5, 0.5)).toEqual({
      accepted: false,
      reason: 'invalid-delay',
    });
    expect(applyMarketDataReconnectFullJitter(Number.MAX_SAFE_INTEGER + 1, 0.5)).toEqual({
      accepted: false,
      reason: 'invalid-delay',
    });
  });

  it('rejects samples outside the normalized interval explicitly', () => {
    for (const sample of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(applyMarketDataReconnectFullJitter(1_000, sample)).toEqual({
        accepted: false,
        reason: 'invalid-sample',
      });
    }
  });
});
