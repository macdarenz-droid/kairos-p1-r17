import { createBinanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionPort } from '../services/market-data/providers/binance/binanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionBinding';
import { createBinanceSpotCandleHistoryPort } from '../services/market-data/providers/binance/binanceSpotCandleHistoryAcquisition';
import { connectBinanceSpotCandleHistoryBrowser } from '../services/market-data/providers/binance/binanceSpotCandleHistoryBrowserConnector';

/** Browser composition only. Existing provider boundaries own acquisition. */
export const analysisHistoryPorts = {
  metadata: createBinanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionPort(),
  history: createBinanceSpotCandleHistoryPort(connectBinanceSpotCandleHistoryBrowser, () => new Date().toISOString()),
};
