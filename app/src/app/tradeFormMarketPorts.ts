import { searchableCryptoMarkets } from '../application/market-reference/symbolSearch';
import type { TradeFormMarket } from '../features/journal/tradeFormMarket';
import { appMarketDataPorts } from './marketDataPorts';

let browserMarket: TradeFormMarket | null = null;

/** Composition root for the trade form's market parts (U14): the build's market list, searchable spot markets only. */
export function browserTradeFormMarket(): TradeFormMarket {
  if (browserMarket) return browserMarket;
  const ports = appMarketDataPorts();
  browserMarket = Object.freeze({
    async marketList(signal: AbortSignal) {
      const result = await ports.metadata.acquireInstrumentMetadata({ signal });
      return result.ok ? { ok: true as const, markets: searchableCryptoMarkets(result.facts) } : { ok: false as const };
    },
  });
  return browserMarket;
}
