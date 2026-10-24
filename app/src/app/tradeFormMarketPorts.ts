import { readMarketMinute } from '../application/market-reference/minuteCheck';
import { readPriceNow } from '../application/market-reference/priceNow';
import { searchableCryptoMarkets } from '../application/market-reference/symbolSearch';
import type { TradeFormMarket } from '../features/journal/tradeFormMarket';
import { appMarketDataPorts } from './marketDataPorts';
import { createTradePictureCandleBrowserDeps } from './tradePictureCandleBrowserDeps';

let browserMarket: TradeFormMarket | null = null;

/** Composition root for the trade form's market parts (U14): the build's market list, searchable spot markets only, coin names, the price now and the minute check. */
export function browserTradeFormMarket(): TradeFormMarket {
  if (browserMarket) return browserMarket;
  const ports = appMarketDataPorts();
  browserMarket = Object.freeze<TradeFormMarket>({
    async marketList(signal: AbortSignal) {
      const result = await ports.metadata.acquireInstrumentMetadata({ signal });
      return result.ok ? { ok: true as const, markets: searchableCryptoMarkets(result.facts) } : { ok: false as const };
    },
    // Names are a help, never a condition: asked beside the list, which never waits for them (D255).
    async coinNames(signal: AbortSignal) {
      const names = await ports.coinNames.coinNames({ signal });
      return names.ok && names.names.size > 0 ? names.names : null;
    },
    // The same candles and market list as the trade picture (D256).
    priceNow: (ask, signal) => readPriceNow(createTradePictureCandleBrowserDeps(), ask, { nowMs: Date.now(), signal }),
    minute: (ask, signal) => readMarketMinute(createTradePictureCandleBrowserDeps(), ask, { nowMs: Date.now(), signal }),
  });
  return browserMarket;
}
