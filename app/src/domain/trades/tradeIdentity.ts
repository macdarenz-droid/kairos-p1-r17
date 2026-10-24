import type { TradeExecutionId, TradeFeeId, TradeId, TradePlanId } from './tradeTypes';

type SupportedTradeId = TradeId | TradePlanId | TradeExecutionId | TradeFeeId;

export function createTradeDomainId<T extends SupportedTradeId>(): T {
  return crypto.randomUUID() as T;
}

/** Journal symbols may be typed as "BTC/USDT" or "btc-usdt"; market symbols (Binance, a forex pair) have no separators. */
export function normalizeTradeSymbol(symbol: string): string {
  return symbol.replace(/[/\-\s]/g, '').toUpperCase();
}
