export type BinanceSpotPublicStreamMessageDecodeResult =
  | { readonly ok: true; readonly payload: unknown }
  | {
      readonly ok: false;
      readonly reason: 'unsupported-message-data' | 'invalid-json';
    };

/**
 * P16.5 owns JSON text decoding only.
 *
 * Browser message-event transport, provider semantic validation, receipt-clock
 * acquisition, reconnect policy, persistence, chart rendering, and journal
 * mutation remain outside this owner.
 */
export function decodeBinanceSpotPublicStreamMessage(
  data: unknown,
): BinanceSpotPublicStreamMessageDecodeResult {
  if (typeof data !== 'string') {
    return { ok: false, reason: 'unsupported-message-data' };
  }

  try {
    return { ok: true, payload: JSON.parse(data) as unknown };
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
}
