export type BinanceSpot24hPublicRestBaselineResponseDecodeResult =
  | { readonly ok: true; readonly payload: unknown }
  | {
      readonly ok: false;
      readonly reason: 'unsupported-response-data' | 'invalid-json';
    };

/**
 * P21.9 owns JSON-text response decoding only.
 *
 * Concrete network transport/status/body acquisition, provider semantic
 * mapping, scope ownership, retry policy, persistence and UI stay outside
 * this owner.
 */
export function decodeBinanceSpot24hPublicRestBaselineResponse(
  data: unknown,
): BinanceSpot24hPublicRestBaselineResponseDecodeResult {
  if (typeof data !== 'string') {
    return { ok: false, reason: 'unsupported-response-data' };
  }

  try {
    return { ok: true, payload: JSON.parse(data) as unknown };
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
}
