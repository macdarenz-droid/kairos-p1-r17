export type BinanceSpotPublicStreamEventClassification =
  | { readonly kind: 'trade'; readonly payload: unknown }
  | { readonly kind: 'server-shutdown'; readonly eventTime: number }
  | { readonly kind: 'other'; readonly payload: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * P16.6 classifies decoded Binance Spot public-stream JSON events only.
 *
 * It does not map trade payloads into observations, acquire clocks, reconnect,
 * schedule timers, construct sockets, persist state, render charts, or mutate
 * journal truth.
 */
export function classifyBinanceSpotPublicStreamEvent(
  payload: unknown,
): BinanceSpotPublicStreamEventClassification {
  if (!isRecord(payload)) {
    return { kind: 'other', payload };
  }

  if (payload.e === 'serverShutdown') {
    const eventTime = payload.E;
    if (
      typeof eventTime === 'number' &&
      Number.isSafeInteger(eventTime) &&
      eventTime >= 0
    ) {
      return { kind: 'server-shutdown', eventTime };
    }

    return { kind: 'other', payload };
  }

  if (payload.e === 'trade') {
    return { kind: 'trade', payload };
  }

  return { kind: 'other', payload };
}
