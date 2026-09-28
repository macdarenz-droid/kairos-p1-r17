import { appMarketDataPorts } from './marketDataPorts';

/** Browser composition only: the build's market data ports (the Kairos server, or Binance directly). */
export const analysisHistoryPorts = {
  metadata: appMarketDataPorts().metadata,
  history: appMarketDataPorts().history,
};
