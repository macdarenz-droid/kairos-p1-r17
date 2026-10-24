import { searchableCryptoMarkets } from '../application/market-reference/symbolSearch';
import type { TradeFormMarket } from '../features/journal/tradeFormMarket';
import { appMarketDataPorts } from './marketDataPorts';

let browserMarket: TradeFormMarket | null = null;

/** Composition root for the trade form's market parts (U14): the build's market list, searchable spot markets only, and coin names. */
export function browserTradeFormMarket(): TradeFormMarket {
  if (browserMarket) return browserMarket;
  const ports = appMarketDataPorts();
  browserMarket = Object.freeze({
    async marketList(signal: AbortSignal) {
      // Names are a help, never a condition: the list shows without them (D255).
      const [result, names] = await Promise.all([ports.metadata.acquireInstrumentMetadata({ signal }), ports.coinNames.coinNames({ signal })]);
      return result.ok ? { ok: true as const, markets: searchableCryptoMarkets(result.facts), names: names.ok && names.names.size > 0 ? names.names : null } : { ok: false as const };
    },
  });
  return browserMarket;
}
