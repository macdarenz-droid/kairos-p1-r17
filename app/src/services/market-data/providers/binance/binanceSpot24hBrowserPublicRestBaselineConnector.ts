import type {
  BinanceSpot24hPublicRestBaselineRequestConnector,
} from './binanceSpot24hPublicRestBaselineRequestExecution';

/**
 * Concrete browser transport for one already-described Binance Spot public
 * 24h REST baseline request. P21.7 still owns URL/method/query semantics;
 * P21.12 still owns caller cancellation propagation. This connector only
 * performs one native fetch and returns the response body as text for the
 * released P21.9 decode seam.
 */
export const connectBinanceSpot24hBrowserPublicRestBaselineRequest:
  BinanceSpot24hPublicRestBaselineRequestConnector<string> = async (
    request,
    options,
  ) => {
    const response = await globalThis.fetch(request.url, {
      method: request.method,
      signal: options?.signal,
    });
    return response.text();
  };
