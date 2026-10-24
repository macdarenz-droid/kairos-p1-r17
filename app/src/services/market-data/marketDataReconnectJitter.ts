export type MarketDataReconnectJitterResult =
  | { readonly accepted: true; readonly delayMs: number }
  | { readonly accepted: false; readonly reason: 'invalid-delay' | 'invalid-sample' };

export function applyMarketDataReconnectFullJitter(
  baseDelayMs: number,
  sample: number,
): MarketDataReconnectJitterResult {
  if (!Number.isSafeInteger(baseDelayMs) || baseDelayMs < 0) {
    return { accepted: false, reason: 'invalid-delay' };
  }

  if (!Number.isFinite(sample) || sample < 0 || sample > 1) {
    return { accepted: false, reason: 'invalid-sample' };
  }

  return {
    accepted: true,
    delayMs: Math.floor(baseDelayMs * sample),
  };
}
