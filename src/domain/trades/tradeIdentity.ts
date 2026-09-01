import type { TradeExecutionId, TradeFeeId, TradeId, TradePlanId } from './tradeTypes';

type SupportedTradeId = TradeId | TradePlanId | TradeExecutionId | TradeFeeId;

export function createTradeDomainId<T extends SupportedTradeId>(): T {
  return crypto.randomUUID() as T;
}
