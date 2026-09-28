import {
  describeBinanceSpotExchangeInfoPublicRestRequest,
} from './binanceSpotExchangeInfoPublicRestRequest';
import {
  executeBinanceSpotExchangeInfoPublicRestRequest,
  type BinanceSpotExchangeInfoPublicRestRequestConnector,
  type BinanceSpotExchangeInfoPublicRestExecutionOptions,
} from './binanceSpotExchangeInfoPublicRestRequestExecution';
import {
  mapBinanceSpotExchangeInfoPublicRestResponseDelivery,
} from './binanceSpotExchangeInfoPublicRestResponseDelivery';

export async function composeBinanceSpotExchangeInfoPublicRestRoundTrip(
  connect: BinanceSpotExchangeInfoPublicRestRequestConnector<unknown>,
  options?: BinanceSpotExchangeInfoPublicRestExecutionOptions,
) {
  const request = describeBinanceSpotExchangeInfoPublicRestRequest();
  const data = options === undefined
    ? await executeBinanceSpotExchangeInfoPublicRestRequest(request, connect)
    : await executeBinanceSpotExchangeInfoPublicRestRequest(request, connect, options);
  return mapBinanceSpotExchangeInfoPublicRestResponseDelivery(data);
}
