import type {
  BinanceSpotExchangeInfoPublicRestRequestConnector,
} from './binanceSpotExchangeInfoPublicRestRequestExecution';

/** Concrete browser transport for one already-described exchangeInfo request. */
export const connectBinanceSpotExchangeInfoBrowserPublicRestRequest:
  BinanceSpotExchangeInfoPublicRestRequestConnector<string> = async (
    request,
    options,
  ) => {
    const response = await globalThis.fetch(request.url, {
      method: request.method,
      signal: options?.signal,
    });
    return response.text();
  };
