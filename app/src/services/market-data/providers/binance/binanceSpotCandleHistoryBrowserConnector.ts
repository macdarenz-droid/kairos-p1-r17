import type { BinanceSpotCandleHistoryConnector } from './binanceSpotCandleHistoryAcquisition';

/** Native public-data transport only. No credentials, redirects, retries or
 * provider fallback; status/body validation belongs to acquisition/mapping. */
export const connectBinanceSpotCandleHistoryBrowser: BinanceSpotCandleHistoryConnector = async (request, options) => {
  const response = await globalThis.fetch(request.url, {
    method: request.method,
    signal: options?.signal,
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
  });
  return { status: response.status, body: await response.text(), retryAfter: response.headers.get('Retry-After') };
};
