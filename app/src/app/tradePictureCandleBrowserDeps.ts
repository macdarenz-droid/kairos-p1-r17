import type { TradePictureCandleDeps } from '../application/trade-visualizer';
import { createTradePictureCandleLoader, type TradePictureCandleLoader } from '../features/journal/tradePictureCandleQueue';
import { loadTradePictureCandles } from '../application/trade-visualizer';
import { appMarketDataPorts } from './marketDataPorts';
import { BINANCE_SPOT_VENUE } from '../services/market-data/providers/binance/binanceSpotTradeStream';

/** Composition root for trade-picture candles: the build's history port and the shared market list. */
export function createTradePictureCandleBrowserDeps(): TradePictureCandleDeps {
  return {
    venue: BINANCE_SPOT_VENUE,
    history: appMarketDataPorts().history,
    metadata: appMarketDataPorts().metadata,
  };
}

let browserLoader: TradePictureCandleLoader | null = null;

/** The app's candle loader for trade pictures: real candles, at most three loads at once, closed trades' kept in memory. */
export function browserTradePictureCandleLoader(): TradePictureCandleLoader {
  if (browserLoader) return browserLoader;
  const deps = createTradePictureCandleBrowserDeps();
  browserLoader = createTradePictureCandleLoader((trade, executions) => loadTradePictureCandles(trade, executions, deps));
  return browserLoader;
}
