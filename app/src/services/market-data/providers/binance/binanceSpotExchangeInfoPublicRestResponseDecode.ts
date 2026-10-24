export type BinanceSpotExchangeInfoPublicRestResponseDecodeResult =
  | { readonly ok: true; readonly payload: unknown }
  | {
      readonly ok: false;
      readonly reason: 'unsupported-response-data' | 'invalid-json';
    };

/**
 * Owns JSON-text response decoding only for the already-executed public
 * Binance Spot exchangeInfo request. Concrete transport/Response acquisition
 * and exchangeInfo semantic interpretation stay outside this owner.
 */
export function decodeBinanceSpotExchangeInfoPublicRestResponse(
  data: unknown,
): BinanceSpotExchangeInfoPublicRestResponseDecodeResult {
  if (typeof data !== 'string') {
    return { ok: false, reason: 'unsupported-response-data' };
  }

  try {
    return { ok: true, payload: JSON.parse(data) as unknown };
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
}
