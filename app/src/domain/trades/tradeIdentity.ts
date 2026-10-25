import type { TradeExecutionId, TradeFeeId, TradeId, TradePlanId, TradeRecord } from './tradeTypes';

type SupportedTradeId = TradeId | TradePlanId | TradeExecutionId | TradeFeeId;

export function createTradeDomainId<T extends SupportedTradeId>(): T {
  return crypto.randomUUID() as T;
}

/**
 * U15 (D259): when a trade happened, for the Journal's order: when it was opened, else (a planned trade) when it was
 * planned. Never missing, so every trade has a place in the order.
 */
export function tradeJournalAt(trade: Pick<TradeRecord, 'openedAt' | 'createdAt'>): string {
  return trade.openedAt ?? trade.createdAt;
}

/** Journal symbols may be typed as "BTC/USDT" or "btc-usdt"; market symbols (Binance, a forex pair) have no separators. */
export function normalizeTradeSymbol(symbol: string): string {
  return symbol.replace(/[/\-\s]/g, '').toUpperCase();
}
